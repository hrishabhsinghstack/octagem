import { getCurrentFxRate } from "@/lib/currency";
import * as store from "@/lib/store/purchaseOrderStore";
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from "@/types/purchaseOrder";

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return [...store.getAll()];
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
  return store.getById(id);
}

export interface CreatePurchaseOrderPayload {
  vendorId: string;
  expectedDate: string;
  notes: string;
  currency: string;
  lines: Omit<PurchaseOrderLine, "id" | "receivedQty" | "receivedItemIds">[];
}

export async function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
  const id = store.nextPurchaseOrderId();
  const order: PurchaseOrder = {
    id,
    vendorId: payload.vendorId,
    status: "Sent",
    issuedAt: new Date().toISOString().slice(0, 10),
    expectedDate: payload.expectedDate,
    notes: payload.notes,
    currency: payload.currency,
    fxRateToBase: getCurrentFxRate(payload.currency),
    lines: payload.lines.map((line, index) => ({ ...line, id: `${id}-L${index + 1}`, receivedQty: 0, receivedItemIds: [] })),
  };
  return store.insert(order);
}

function deriveStatus(lines: PurchaseOrderLine[], previous: PurchaseOrderStatus): PurchaseOrderStatus {
  if (previous === "Draft" || previous === "Cancelled") return previous;
  const totalExpected = lines.reduce((sum, l) => sum + l.expectedQty, 0);
  const totalReceived = lines.reduce((sum, l) => sum + l.receivedQty, 0);
  if (totalReceived === 0) return "Sent";
  if (totalReceived >= totalExpected) return "Received";
  return "Partially received";
}

/** Called after ReceiveItemDialog creates an item against a PO line — records the link and rolls up the PO's status. */
export async function recordLineReceipt(orderId: string, lineId: string, receivedItemId: string): Promise<PurchaseOrder | undefined> {
  const order = store.getById(orderId);
  if (!order) return undefined;
  const lines = order.lines.map((line) => (line.id === lineId ? { ...line, receivedQty: line.receivedQty + 1, receivedItemIds: [...line.receivedItemIds, receivedItemId] } : line));
  return store.update(orderId, { lines, status: deriveStatus(lines, order.status) });
}

export async function setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder | undefined> {
  return store.update(id, { status });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  store.remove(id);
}
