import { createInvoiceFromMemo } from "@/lib/api/invoiceApi";
import { getById as getInventoryItem, update as updateItem } from "@/lib/store/inventoryStore";
import { getById as getCustomer } from "@/lib/store/customerStore";
import { openMemoLines } from "@/lib/memo";
import * as store from "@/lib/store/memoStore";
import type { InventoryItem } from "@/types/inventory";
import type { MemoLine, MemoRecord } from "@/types/memo";

export async function listMemos(): Promise<MemoRecord[]> {
  return [...store.getAll()];
}

export async function getMemo(id: string): Promise<MemoRecord | undefined> {
  return store.getById(id);
}

export interface IssueMemoPayload {
  customerId: string;
  counterparty: string;
  memoToAddress: string;
  shipToAddress: string;
  contact: string;
  phone: string;
  poNumber?: string;
  shipVia?: string;
  terms?: string;
  salesperson: string;
  salespersonCommissionPct?: number;
  dueDate: string;
  lines: Omit<MemoLine, "id">[];
}

export async function issueMemo(payload: IssueMemoPayload, actor = "Jordan Miller"): Promise<MemoRecord> {
  const id = store.nextMemoId();
  const memo: MemoRecord = {
    id,
    customerId: payload.customerId,
    counterparty: payload.counterparty,
    memoToAddress: payload.memoToAddress,
    shipToAddress: payload.shipToAddress,
    contact: payload.contact,
    phone: payload.phone,
    poNumber: payload.poNumber,
    shipVia: payload.shipVia,
    terms: payload.terms,
    trackingNumber: "",
    salesperson: payload.salesperson,
    salespersonCommissionPct: payload.salespersonCommissionPct,
    lines: payload.lines.map((line, index) => ({ ...line, id: `${id}-L${index + 1}` })),
    issuedAt: new Date().toISOString().slice(0, 10),
    dueDate: payload.dueDate,
    status: "Open",
  };
  store.insert(memo);

  memo.lines.forEach((line) => {
    updateItem(
      line.itemId,
      { status: "On memo out", custodyHolder: payload.counterparty, location: `With ${payload.counterparty}` },
      { occurredAt: memo.issuedAt, type: "MEMO_OUT", note: `Sent on memo to ${payload.counterparty} — Memo ${id}.`, actor }
    );
  });

  return memo;
}

export async function extendMemo(id: string, newDueDate: string, actor = "Jordan Miller"): Promise<MemoRecord | undefined> {
  const memo = store.getById(id);
  if (!memo) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  // Only what is still out — extending the due date says nothing about an item already bought or returned.
  openMemoLines(memo.lines).forEach((line) => {
    updateItem(line.itemId, {}, { occurredAt: today, type: "TRANSFER", note: `Memo ${id} extended to ${newDueDate}.`, actor });
  });
  return store.update(id, { dueDate: newDueDate });
}

/**
 * Takes lines back into stock. `lineIds` returns just those; omitting it returns everything still
 * out. The memo only closes once nothing is left in the counterparty's hands — a customer sending
 * back three of five stones has not ended the custody relationship.
 */
export async function returnMemo(id: string, lineIds?: string[], actor = "Jordan Miller"): Promise<MemoRecord | undefined> {
  const memo = store.getById(id);
  if (!memo) return undefined;

  const targets = selectOpenLines(memo, lineIds);
  if (targets.length === 0) return memo;

  const today = new Date().toISOString().slice(0, 10);
  const targetIds = new Set(targets.map((line) => line.id));
  targets.forEach((line) => {
    updateItem(
      line.itemId,
      { status: "Available", custodyHolder: "OctaGem Demo Co.", location: "New York · Receiving · Return inspection" },
      { occurredAt: today, type: "MEMO_RETURN_IN", note: `Returned from ${memo.counterparty} on memo ${id}.`, actor }
    );
  });

  const lines = memo.lines.map((line) => (targetIds.has(line.id) ? { ...line, settledAs: "Returned" as const } : line));
  const closed = lines.every((line) => line.settledAs);
  return store.update(id, { lines, ...(closed ? { status: "Returned" as const } : {}) });
}

/** The lines an action applies to: the named ones if given, otherwise everything still in custody. Already-settled ids are ignored rather than double-processed. */
function selectOpenLines(memo: MemoRecord, lineIds?: string[]): MemoLine[] {
  const open = openMemoLines(memo.lines);
  return lineIds ? open.filter((line) => lineIds.includes(line.id)) : open;
}

/**
 * §13.7 — conversion is the only path from memo to invoice. `lineIds` converts just those lines, for
 * the ordinary case where a customer keeps two of five stones and returns the rest; the memo stays
 * Open with the remainder rather than being force-closed around a partial sale. Omitting `lineIds`
 * converts everything still out, which is the whole-memo case.
 */
export async function convertMemo(id: string, lineIds?: string[]): Promise<MemoRecord | undefined> {
  const memo = store.getById(id);
  if (!memo) return undefined;

  const targets = selectOpenLines(memo, lineIds);
  if (targets.length === 0) return memo;

  const targetIds = new Set(targets.map((line) => line.id));
  const invoiceLines = targets
    .map((line) => {
      const item = getInventoryItem(line.itemId);
      return item ? { item, description: `${item.code} · ${item.title}`, lineTotal: line.lineTotal } : undefined;
    })
    .filter((line): line is { item: InventoryItem; description: string; lineTotal: number } => Boolean(line));
  if (invoiceLines.length === 0) return memo;

  const customer = getCustomer(memo.customerId);
  const invoice = await createInvoiceFromMemo(memo.id, memo.customerId, memo.salesperson, invoiceLines, customer?.currency ?? "USD", customer?.taxRateId);

  const lines = memo.lines.map((line) => (targetIds.has(line.id) ? { ...line, settledAs: "Invoiced" as const, invoiceId: invoice.id } : line));
  const closed = lines.every((line) => line.settledAs);
  // The memo-level invoiceId is the one that closed it out; partial conversions are recorded per line.
  return store.update(id, { lines, ...(closed ? { status: "Converted" as const, invoiceId: invoice.id } : {}) });
}
