import { createInvoiceFromMemo } from "@/lib/api/invoiceApi";
import { getById as getInventoryItem, update as updateItem } from "@/lib/store/inventoryStore";
import { getById as getCustomer } from "@/lib/store/customerStore";
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
  memo.lines.forEach((line) => {
    updateItem(line.itemId, {}, { occurredAt: today, type: "TRANSFER", note: `Memo ${id} extended to ${newDueDate}.`, actor });
  });
  return store.update(id, { dueDate: newDueDate });
}

export async function returnMemo(id: string, actor = "Jordan Miller"): Promise<MemoRecord | undefined> {
  const memo = store.getById(id);
  if (!memo) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  memo.lines.forEach((line) => {
    updateItem(
      line.itemId,
      { status: "Available", custodyHolder: "OctaGem Demo Co.", location: "New York · Receiving · Return inspection" },
      { occurredAt: today, type: "MEMO_RETURN_IN", note: `Returned from ${memo.counterparty}; memo ${id} closed.`, actor }
    );
  });
  return store.update(id, { status: "Returned" });
}

/** §13.7 — conversion is the only path from memo to invoice; this is where that actually happens now (previously just flipped item status with a bare ledger note). */
export async function convertMemo(id: string): Promise<MemoRecord | undefined> {
  const memo = store.getById(id);
  if (!memo) return undefined;

  const lines = memo.lines
    .map((line) => {
      const item = getInventoryItem(line.itemId);
      return item ? { item, description: `${item.code} · ${item.title}`, lineTotal: line.lineTotal } : undefined;
    })
    .filter((line): line is { item: InventoryItem; description: string; lineTotal: number } => Boolean(line));
  const customer = getCustomer(memo.customerId);
  const invoice = await createInvoiceFromMemo(memo.id, memo.customerId, memo.salesperson, lines, customer?.currency ?? "USD", customer?.taxRateId);

  return store.update(id, { status: "Converted", invoiceId: invoice.id });
}
