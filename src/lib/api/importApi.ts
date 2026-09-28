import { optionLookups } from "@/lib/api/catalogApi";
import { applyValues, withTypedDefaults } from "@/lib/inventory/catalogForm";
import type { ImportContext, ImportPlan, PlannedRow } from "@/lib/inventory/importPlan";
import { buildWorkbookSpec, itemToRow, type WorkbookSpec } from "@/lib/inventory/sheetSpec";
import { getBusinessProfile } from "@/lib/api/settingsApi";
import { fieldsForCategory, optionsForField } from "@/lib/inventory/registry";
import { getMarketSettings, getState as getCatalogState } from "@/lib/store/catalogStore";
import * as batchStore from "@/lib/store/importBatchStore";
import * as store from "@/lib/store/inventoryStore";
import type { ImportBatch } from "@/types/importBatch";
import type { InventoryItem, LedgerEntry } from "@/types/inventory";

/**
 * Committing and undoing spreadsheet imports. Planning is pure (lib/inventory/importPlan); this is
 * the only part that writes, and it writes each import in one step (inventoryStore.applyBatch).
 */
export class ImportError extends Error {}

/** Everything a plan is validated against, read fresh — call again right before committing. */
export async function getImportContext(): Promise<ImportContext> {
  const catalog = getCatalogState();
  return {
    categories: catalog.categories.filter((c) => c.active),
    fieldsFor: (key) => fieldsForCategory(catalog, key),
    optionsFor: (field, resolved, category) => optionsForField(field, resolved, category, optionLookups),
    existing: store.getAll(),
    dateOrder: getMarketSettings().dateOrder,
  };
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  return batchStore.getAll();
}

const today = () => new Date().toISOString().slice(0, 10);
const ledgerId = () => `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function toItem(row: PlannedRow, base: InventoryItem | undefined, entry: LedgerEntry): InventoryItem {
  const catalog = getCatalogState();
  const categoryKey = row.categoryKey!;
  const category = catalog.categories.find((c) => c.key === categoryKey);
  const fields = fieldsForCategory(catalog, categoryKey);
  const draft = withTypedDefaults(categoryKey, applyValues<Partial<InventoryItem>>(base ?? {}, fields, row.raw, row.values));

  if (base) return { ...base, ...draft, id: base.id, code: base.code, ledger: [entry, ...base.ledger] } as InventoryItem;

  const code = String(draft.code).trim().toUpperCase();
  return {
    ...draft,
    id: code,
    code,
    category: categoryKey,
    identityModel: draft.identityModel ?? category?.defaultIdentityModel ?? "UNIQUE",
    quantity: draft.identityModel === "UNIQUE" ? undefined : draft.quantity,
    title: draft.title ?? code,
    description: draft.description?.trim() || `${category?.label ?? categoryKey} · imported`,
    status: "Available",
    location: draft.location ?? "",
    custodyHolder: "OctaGem Demo Co.",
    cost: draft.cost ?? 0,
    askingPrice: draft.askingPrice ?? 0,
    receivedAt: today(),
    ownership: "OWNED",
    media: [],
    ledger: [entry],
  } as InventoryItem;
}

export interface CommitOptions {
  fileName: string;
  /** Refuse the whole file if any row has an error. Default: import the valid rows, skip the rest. */
  allOrNothing?: boolean;
}

/**
 * Writes the plan's valid rows. The plan must have been built against the current stock — callers
 * re-plan with a fresh getImportContext() right before committing, so a stock number taken since the
 * preview is caught (and the store's batch write refuses duplicates regardless).
 */
export async function commitImport(plan: ImportPlan, options: CommitOptions, actor = "Jordan Miller"): Promise<ImportBatch> {
  if (options.allOrNothing && plan.summary.error > 0) {
    throw new ImportError(`${plan.summary.error} row${plan.summary.error === 1 ? " has" : "s have"} errors — nothing was imported. Fix them, or import the valid rows only.`);
  }
  const ready = plan.rows.filter((r) => r.action === "create" || r.action === "update");
  if (ready.length === 0) throw new ImportError("No valid rows to import.");

  const id = batchStore.nextBatchId();
  const inserts: InventoryItem[] = [];
  const replaces: InventoryItem[] = [];
  const updated: ImportBatch["updated"] = [];

  for (const row of ready) {
    const entry = (type: LedgerEntry["type"], note: string): LedgerEntry => ({ id: ledgerId(), occurredAt: today(), type, note, actor, batchId: id });
    if (row.action === "update") {
      const current = store.getById(row.existingId!);
      if (!current) throw new ImportError(`${row.code} was removed after the preview — review the file again.`);
      const { media: _media, ...before } = current;
      updated.push({ id: current.id, before });
      replaces.push(toItem(row, current, entry("COUNT_ADJUSTMENT", `Updated by import ${id} (${options.fileName}, ${row.sheetName ? `${row.sheetName} ` : ""}row ${row.rowNumber}).`)));
    } else {
      inserts.push(toItem(row, undefined, entry("PURCHASE_RECEIPT", `Imported by ${id} (${options.fileName}, ${row.sheetName ? `${row.sheetName} ` : ""}row ${row.rowNumber}).`)));
    }
  }

  store.applyBatch({ inserts, replaces });
  return batchStore.insert({
    id,
    fileName: options.fileName,
    importedAt: new Date().toISOString(),
    actor,
    mode: updated.length > 0 ? "upsert" : "create",
    createdIds: inserts.map((item) => item.id),
    updated,
    skippedRows: plan.summary.error,
  });
}

/**
 * Reverses an import: removes the items it created and restores the ones it updated — but only
 * where nothing has happened since. An imported stone already sent on memo, or re-edited, is left
 * alone and reported, because undoing it would erase real later activity.
 */
export async function undoImport(batchId: string): Promise<ImportBatch> {
  const batch = batchStore.getById(batchId);
  if (!batch) throw new ImportError(`Import ${batchId} not found.`);
  if (batch.undoneAt) throw new ImportError(`Import ${batchId} was already undone.`);

  const removes: string[] = [];
  const replaces: InventoryItem[] = [];
  const skipped: string[] = [];

  for (const itemId of batch.createdIds) {
    const item = store.getById(itemId);
    if (!item) continue; // already deleted by hand — nothing to undo
    if (item.ledger.length === 1 && item.ledger[0].batchId === batch.id) removes.push(item.id);
    else skipped.push(item.code);
  }
  for (const { id, before } of batch.updated) {
    const item = store.getById(id);
    if (!item) continue;
    if (item.ledger[0]?.batchId === batch.id) replaces.push({ ...before, media: item.media } as InventoryItem);
    else skipped.push(item.code);
  }

  store.applyBatch({ removes, replaces });
  return batchStore.update(batch.id, { undoneAt: new Date().toISOString(), undoSkipped: skipped })!;
}

/* ---------------------------------------------------------------- template & export */

/**
 * The template/export layout for the given categories (default: every active one). Dropdowns list
 * the tenant's own master data; a scoped list (karat) offers every value, since Excel can't filter
 * one column by another without fragile named ranges — the import still checks karat against metal.
 */
export async function getWorkbookSpec(categoryKeys?: string[]): Promise<WorkbookSpec> {
  const context = await getImportContext();
  const business = await getBusinessProfile();
  return buildWorkbookSpec({
    categories: categoryKeys ? context.categories.filter((c) => categoryKeys.includes(c.key)) : context.categories,
    fieldsFor: context.fieldsFor,
    listValues: (field, category) =>
      field.source?.kind === "masterList" && field.source.scopedByField
        ? optionLookups.getList(field.source.key).filter((e) => e.active).map((e) => e.label)
        : context.optionsFor(field, {}, category),
    dateOrder: context.dateOrder,
    companyName: business.companyName,
  });
}

/** Rows per sheet for exporting `items` — same columns as the import template, so it re-imports cleanly. */
export async function exportRows(items: InventoryItem[], spec: WorkbookSpec): Promise<Record<string, unknown[][]>> {
  const catalog = getCatalogState();
  const rows: Record<string, unknown[][]> = {};
  for (const sheet of spec.sheets) {
    const fieldsByKey = new Map(fieldsForCategory(catalog, sheet.categoryKey).map((f) => [f.key, f]));
    rows[sheet.name] = items.filter((item) => item.category === sheet.categoryKey).map((item) => itemToRow(item, sheet, fieldsByKey));
  }
  return rows;
}
