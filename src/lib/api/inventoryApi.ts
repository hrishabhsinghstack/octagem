import * as store from "@/lib/store/inventoryStore";
import type { DiamondAttributes, IdentityModel, InventoryCategory, InventoryItem, ItemOwnership, JewelryAttributes, MediaAsset, MediaKind, WatchAttributes } from "@/types/inventory";

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
}

export async function receiveItem(payload: ReceiveItemPayload, actor = "Jordan Miller"): Promise<InventoryItem> {
  const item: InventoryItem = {
    id: payload.code,
    code: payload.code,
    category: payload.category,
    identityModel: payload.identityModel,
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
  return store.insert(item);
}

export interface EditItemPayload {
  title: string;
  description: string;
  location: string;
  cost: number;
  askingPrice: number;
  diamond?: DiamondAttributes;
  jewelry?: JewelryAttributes;
  watch?: WatchAttributes;
  customFields?: Record<string, string | number | boolean>;
}

export async function updateItemDetails(id: string, payload: EditItemPayload, actor = "Jordan Miller"): Promise<InventoryItem | undefined> {
  return store.update(id, payload, { occurredAt: new Date().toISOString().slice(0, 10), type: "COUNT_ADJUSTMENT", note: "Item details updated.", actor });
}

export async function deleteItem(id: string): Promise<void> {
  store.remove(id);
}

export async function duplicateItem(id: string, newCode: string, actor = "Jordan Miller"): Promise<InventoryItem | undefined> {
  const source = store.getById(id);
  if (!source) return undefined;
  const copy: InventoryItem = {
    ...source,
    id: newCode,
    code: newCode,
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
