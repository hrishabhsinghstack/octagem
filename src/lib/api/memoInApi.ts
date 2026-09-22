import { update as updateItem } from "@/lib/store/inventoryStore";
import * as store from "@/lib/store/memoInStore";
import type { MemoInLine, MemoInRecord, MemoInStatus } from "@/types/memoIn";

export async function listMemoIns(): Promise<MemoInRecord[]> {
  return [...store.getAll()];
}

export async function getMemoIn(id: string): Promise<MemoInRecord | undefined> {
  return store.getById(id);
}

export interface CreateMemoInPayload {
  vendorId: string;
  counterparty: string;
  contact: string;
  phone: string;
  vendorRef?: string;
  salesperson: string;
  dueDate: string;
  notes: string;
  lines: Omit<MemoInLine, "id" | "receivedQty" | "receivedItemIds">[];
}

export async function createMemoIn(payload: CreateMemoInPayload): Promise<MemoInRecord> {
  const id = store.nextMemoInId();
  const record: MemoInRecord = {
    id,
    vendorId: payload.vendorId,
    counterparty: payload.counterparty,
    contact: payload.contact,
    phone: payload.phone,
    vendorRef: payload.vendorRef,
    salesperson: payload.salesperson,
    issuedAt: new Date().toISOString().slice(0, 10),
    dueDate: payload.dueDate,
    status: "Open",
    notes: payload.notes,
    lines: payload.lines.map((line, index) => ({ ...line, id: `${id}-L${index + 1}`, receivedQty: 0, receivedItemIds: [] })),
  };
  return store.insert(record);
}

function deriveStatus(lines: MemoInLine[]): MemoInStatus {
  const totalExpected = lines.reduce((sum, l) => sum + l.expectedQty, 0);
  const totalReceived = lines.reduce((sum, l) => sum + l.receivedQty, 0);
  if (totalReceived === 0) return "Open";
  if (totalReceived >= totalExpected) return "Received";
  return "Partially received";
}

/** Called after ReceiveItemDialog creates a consigned item against a Memo In line — records the link and rolls up status, mirroring purchaseOrderApi.recordLineReceipt. */
export async function recordLineReceipt(memoInId: string, lineId: string, receivedItemId: string): Promise<MemoInRecord | undefined> {
  const record = store.getById(memoInId);
  if (!record) return undefined;
  const lines = record.lines.map((line) => (line.id === lineId ? { ...line, receivedQty: line.receivedQty + 1, receivedItemIds: [...line.receivedItemIds, receivedItemId] } : line));
  return store.update(memoInId, { lines, status: deriveStatus(lines) });
}

/** Item-level action — a consigned item that never sold goes back to the vendor. Nothing is deleted; the item keeps its record with a terminal status, matching the ledger-first "nothing mutates without a movement" rule. */
export async function returnItemToVendor(itemId: string, vendorName: string, actor = "Jordan Miller"): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  updateItem(itemId, { status: "Returned to vendor" }, { occurredAt: today, type: "CONSIGNMENT_RETURN", note: `Returned to ${vendorName}; consignment closed.`, actor });
}
