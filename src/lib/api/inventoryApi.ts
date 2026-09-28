import { sameRaw } from "@/lib/inventory/catalogForm";
import { findUniqueConflicts, getPath, setPath } from "@/lib/inventory/fieldValues";
import { fieldsForCategory } from "@/lib/inventory/registry";
import { getState as getCatalogState } from "@/lib/store/catalogStore";
import * as store from "@/lib/store/inventoryStore";
import type { FieldValue } from "@/types/catalog";
import type { DiamondAttributes, IdentityModel, InventoryCategory, InventoryItem, ItemOwnership, JewelryAttributes, MediaAsset, MediaKind, WatchAttributes } from "@/types/inventory";

export class DuplicateValueError extends Error {}

/**
 * Enforces the catalog's `unique` fields (certificate #, watch serial, HUID) at the API boundary,
 * so the form, duplicate and future import all hit the same rule. Stock number itself is enforced
 * by the store's insert.
 */
function assertUniqueValues(candidate: InventoryItem, excludeId?: string, previous?: InventoryItem) {
  const fields = fieldsForCategory(getCatalogState(), candidate.category)
    .filter((f) => f.unique && f.key !== "code")
    // A clash the item already had (e.g. a legacy placeholder serial) must not block an unrelated edit.
    .filter((f) => !previous || !sameRaw(getPath(previous, f.path), getPath(candidate, f.path)));
  const values: Record<string, FieldValue> = {};
  for (const field of fields) {
    const value = getPath(candidate, field.path);
    if (typeof value === "string" || typeof value === "number") values[field.key] = value;
  }
  const conflicts = findUniqueConflicts(fields, values, store.getAll(), excludeId);
  if (conflicts.length > 0) throw new DuplicateValueError(conflicts.map((c) => c.message).join(" · "));
}

/**
 * Thin wrapper over the local store, deliberately shaped like a future HTTP client
 * (async, returns a copy) so swapping in real endpoints later touches this file only.
 */
export async function listInventory(): Promise<InventoryItem[]> {
  return [...store.getAll()];
}

export async function getItem(id: string): Promise<InventoryItem | undefined> {
  return store.getById(id);
}

export interface ReceiveItemPayload {
  category: InventoryCategory;
  identityModel: IdentityModel;
  quantity?: number;
  code: string;
  title: string;
  description: string;
  location: string;
  cost: number;
  askingPrice: number;
  vendorId?: string;
  purchaseOrderId?: string;
  diamond?: DiamondAttributes;
  jewelry?: JewelryAttributes;
  watch?: WatchAttributes;
  ownership?: ItemOwnership;
  memoInId?: string;
  consignmentValue?: number;
  consignmentPriceBasis?: string;
  customFields?: Record<string, string | number | boolean>;
  /** Tenant-category and market-pack field values (catalog fields with an `attributes.*` path). */
  attributes?: Record<string, FieldValue>;
}

export async function receiveItem(payload: ReceiveItemPayload, actor = "Jordan Miller"): Promise<InventoryItem> {
  const code = payload.code.trim().toUpperCase();
  const item: InventoryItem = {
    id: code,
    code,
    category: payload.category,
    identityModel: payload.identityModel,
    quantity: payload.identityModel === "UNIQUE" ? undefined : payload.quantity,
    title: payload.title,
    description: payload.description,
    status: "Available",
    location: payload.location,
    custodyHolder: "OctaGem Demo Co.",
    cost: payload.cost,
    askingPrice: payload.askingPrice,
    receivedAt: new Date().toISOString().slice(0, 10),
    vendorId: payload.vendorId,
    purchaseOrderId: payload.purchaseOrderId,
    ownership: payload.ownership ?? "OWNED",
    memoInId: payload.memoInId,
    consignmentValue: payload.consignmentValue,
    consignmentPriceBasis: payload.consignmentPriceBasis,
    diamond: payload.diamond,
    jewelry: payload.jewelry,
    watch: payload.watch,
    customFields: payload.customFields,
    attributes: payload.attributes,
    media: [],
    ledger: [
      {
        id: `ledger-${Date.now()}`,
        occurredAt: new Date().toISOString().slice(0, 10),
        type: payload.memoInId ? "CONSIGNMENT_IN" : "PURCHASE_RECEIPT",
        note: payload.memoInId
          ? `Received on consignment into ${payload.location} against Memo In ${payload.memoInId}.`
          : payload.purchaseOrderId
            ? `Received into ${payload.location} against PO ${payload.purchaseOrderId}.`
            : `Received into ${payload.location}.`,
        actor,
      },
    ],
  };
  assertUniqueValues(item);
  return store.insert(item);
}

export interface EditItemPayload {
  quantity?: number;
  title: string;
  description: string;
  location: string;
  cost: number;
  askingPrice: number;
  diamond?: DiamondAttributes;
  jewelry?: JewelryAttributes;
  watch?: WatchAttributes;
  customFields?: Record<string, string | number | boolean>;
  /** Tenant-category and market-pack field values (catalog fields with an `attributes.*` path). */
  attributes?: Record<string, FieldValue>;
}

export async function updateItemDetails(id: string, payload: EditItemPayload, actor = "Jordan Miller"): Promise<InventoryItem | undefined> {
  const current = store.getById(id);
  if (!current) return undefined;
  assertUniqueValues({ ...current, ...payload }, id, current);
  return store.update(id, payload, { occurredAt: new Date().toISOString().slice(0, 10), type: "COUNT_ADJUSTMENT", note: "Item details updated.", actor });
}

export async function deleteItem(id: string): Promise<void> {
  store.remove(id);
}

export async function duplicateItem(id: string, newCode: string, actor = "Jordan Miller"): Promise<InventoryItem | undefined> {
  const source = store.getById(id);
  if (!source) return undefined;
  const code = newCode.trim().toUpperCase();
  let copy: InventoryItem = {
    ...source,
    id: code,
    code,
    status: "Available",
    custodyHolder: "OctaGem Demo Co.",
    location: source.location,
    receivedAt: new Date().toISOString().slice(0, 10),
    media: [],
    ledger: [
      {
        id: `ledger-${Date.now()}`,
        occurredAt: new Date().toISOString().slice(0, 10),
        type: "PURCHASE_RECEIPT",
        note: `Duplicated from ${source.code}.`,
        actor,
      },
    ],
  };
  // A duplicate is a sibling piece, not the same stone: identifiers that must be unique start blank.
  for (const field of fieldsForCategory(getCatalogState(), copy.category)) {
    if (field.unique && field.key !== "code" && getPath(copy, field.path) !== undefined) copy = setPath(copy, field.path, "");
  }
  return store.insert(copy);
}

export async function addMedia(itemId: string, kind: MediaKind, dataUrl: string, fileName: string): Promise<InventoryItem | undefined> {
  const current = store.getById(itemId);
  if (!current) return undefined;
  const asset: MediaAsset = {
    id: `media-${Date.now()}`,
    kind,
    dataUrl,
    fileName,
    uploadedAt: new Date().toISOString().slice(0, 10),
    isPrimary: current.media.length === 0,
  };
  return store.update(itemId, { media: [...current.media, asset] });
}

export async function removeMedia(itemId: string, assetId: string): Promise<InventoryItem | undefined> {
  const current = store.getById(itemId);
  if (!current) return undefined;
  const wasPrimary = current.media.find((m) => m.id === assetId)?.isPrimary;
  let media = current.media.filter((m) => m.id !== assetId);
  if (wasPrimary && media.length > 0) {
    media = media.map((m, i) => ({ ...m, isPrimary: i === 0 }));
  }
  return store.update(itemId, { media });
}

export async function setPrimaryMedia(itemId: string, assetId: string): Promise<InventoryItem | undefined> {
  const current = store.getById(itemId);
  if (!current) return undefined;
  const media = current.media.map((m) => ({ ...m, isPrimary: m.id === assetId }));
  return store.update(itemId, { media });
}
