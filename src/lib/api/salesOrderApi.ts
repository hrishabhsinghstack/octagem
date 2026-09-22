import { getCurrentFxRate } from "@/lib/currency";
import { update as updateItem } from "@/lib/store/inventoryStore";
import * as store from "@/lib/store/salesOrderStore";
import type { SalesOrder, SalesOrderLine, SalesOrderStatus } from "@/types/salesOrder";

export async function listSalesOrders(): Promise<SalesOrder[]> {
  return [...store.getAll()];
}

export async function getSalesOrder(id: string): Promise<SalesOrder | undefined> {
  return store.getById(id);
}

export interface CreateSalesOrderPayload {
  customerId: string;
  salesperson: string;
  sourceQuoteId?: string;
  currency: string;
  /** Pass through an already-struck rate (e.g. inherited from an accepted Quote) to avoid re-resolving a fresh one; omit to look up the current admin-maintained rate. */
  fxRateToBase?: number;
  lines: Omit<SalesOrderLine, "id" | "fulfilled">[];
}

export async function createSalesOrder(payload: CreateSalesOrderPayload, actor = "Jordan Miller"): Promise<SalesOrder> {
  const id = store.nextSalesOrderId();
  const order: SalesOrder = {
    id,
    customerId: payload.customerId,
    sourceQuoteId: payload.sourceQuoteId,
    salesperson: payload.salesperson,
    orderedAt: new Date().toISOString().slice(0, 10),
    status: "Allocated",
    invoiceIds: [],
    currency: payload.currency,
    fxRateToBase: payload.fxRateToBase ?? getCurrentFxRate(payload.currency),
    lines: payload.lines.map((line, index) => ({ ...line, id: `${id}-L${index + 1}`, fulfilled: false })),
  };
  store.insert(order);

  const today = order.orderedAt;
  order.lines.forEach((line) => {
    updateItem(line.itemId, { status: "Reserved" }, { occurredAt: today, type: "TRANSFER", note: `Allocated to Sales Order ${id}.`, actor });
  });

  return order;
}

function deriveStatus(lines: SalesOrderLine[]): SalesOrderStatus {
  if (lines.every((l) => l.fulfilled)) return "Fulfilled";
  if (lines.some((l) => l.fulfilled)) return "Partially fulfilled";
  return "Allocated";
}

export async function fulfilLine(orderId: string, lineId: string, actor = "Jordan Miller"): Promise<SalesOrder | undefined> {
  const order = store.getById(orderId);
  if (!order) return undefined;
  const lines = order.lines.map((line) => (line.id === lineId ? { ...line, fulfilled: true } : line));
  const status = deriveStatus(lines);
  const line = order.lines.find((l) => l.id === lineId);
  if (line) {
    updateItem(line.itemId, {}, { occurredAt: new Date().toISOString().slice(0, 10), type: "TRANSFER", note: `Fulfilled on Sales Order ${orderId}; ready to invoice.`, actor });
  }
  return store.update(orderId, { lines, status });
}

export async function cancelSalesOrder(id: string, actor = "Jordan Miller"): Promise<SalesOrder | undefined> {
  const order = store.getById(id);
  if (!order) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  order.lines.forEach((line) => {
    if (!line.fulfilled) {
      updateItem(line.itemId, { status: "Available" }, { occurredAt: today, type: "TRANSFER", note: `Allocation released — Sales Order ${id} cancelled.`, actor });
    }
  });
  return store.update(id, { status: "Cancelled" });
}

export async function markInvoiced(orderId: string, invoiceId: string): Promise<SalesOrder | undefined> {
  const order = store.getById(orderId);
  if (!order) return undefined;
  return store.update(orderId, { status: "Invoiced", invoiceIds: [...order.invoiceIds, invoiceId] });
}
