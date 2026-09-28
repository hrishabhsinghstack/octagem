import { getCurrentFxRate, getTaxRatePercent } from "@/lib/currency";
import { update as updateItem } from "@/lib/store/inventoryStore";
import * as store from "@/lib/store/invoiceStore";
import { createVendorBillsForConsignedSales } from "@/lib/api/vendorBillApi";
import type { Invoice, InvoiceLine, InvoiceSource } from "@/types/invoice";
import type { InventoryItem } from "@/types/inventory";

export async function listInvoices(): Promise<Invoice[]> {
  return [...store.getAll()];
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  return store.getById(id);
}

interface BuildInvoiceOptions {
  currency: string;
  fxRateToBase?: number;
  taxRateId?: string;
}

function buildInvoice(
  id: string,
  customerId: string,
  salesperson: string,
  sourceType: InvoiceSource,
  sourceId: string | undefined,
  lines: InvoiceLine[],
  options: BuildInvoiceOptions
): Invoice {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const taxRatePercent = getTaxRatePercent(options.taxRateId);
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return {
    id,
    customerId,
    lines,
    subtotal,
    taxRateId: options.taxRateId,
    tax,
    discount: 0,
    shipping: 0,
    total: subtotal + tax,
    status: "Open",
    sourceType,
    sourceId,
    salesperson,
    issuedAt: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    currency: options.currency,
    fxRateToBase: options.fxRateToBase ?? getCurrentFxRate(options.currency),
    paidAmount: 0,
  };
}

/** §13.5 — any consigned item in the batch simultaneously creates a vendor bill; this is the single choke point all three creators below funnel through, so the trigger only needs to live here once. */
async function markItemsSold(items: InventoryItem[], note: string, actor: string, invoiceId: string) {
  const today = new Date().toISOString().slice(0, 10);
  items.forEach((item) => updateItem(item.id, { status: "Sold" }, { occurredAt: today, type: "SALE", note, actor }));

  const consignedLines = items
    .filter((item) => item.ownership === "CONSIGNED_IN" && item.vendorId)
    .map((item) => ({ item, amount: item.consignmentValue ?? 0 }));
  if (consignedLines.length > 0) {
    await createVendorBillsForConsignedSales(consignedLines, invoiceId);
  }
}

export interface DirectInvoicePayload {
  customerId: string;
  salesperson: string;
  currency: string;
  taxRateId?: string;
  items: { item: InventoryItem; unitPrice: number }[];
}

export async function createDirectInvoice(payload: DirectInvoicePayload, actor = "Jordan Miller"): Promise<Invoice> {
  const id = store.nextInvoiceId();
  const lines: InvoiceLine[] = payload.items.map((entry, index) => ({
    id: `${id}-L${index + 1}`,
    itemId: entry.item.id,
    description: `${entry.item.code} · ${entry.item.title}`,
    unitPrice: entry.unitPrice,
    quantity: 1,
    lineTotal: entry.unitPrice,
  }));
  const invoice = buildInvoice(id, payload.customerId, payload.salesperson, "Direct", undefined, lines, {
    currency: payload.currency,
    taxRateId: payload.taxRateId,
  });
  store.insert(invoice);
  await markItemsSold(
    payload.items.map((e) => e.item),
    `Sold and invoiced — ${id}.`,
    actor,
    id
  );
  return invoice;
}

export interface MemoConversionLine {
  item: InventoryItem;
  description: string;
  lineTotal: number;
}

export async function createInvoiceFromMemo(
  memoId: string,
  customerId: string,
  salesperson: string,
  lines: MemoConversionLine[],
  currency = "USD",
  taxRateId?: string,
  actor = "Jordan Miller"
): Promise<Invoice> {
  const id = store.nextInvoiceId();
  const invoiceLines: InvoiceLine[] = lines.map((line, index) => ({ id: `${id}-L${index + 1}`, itemId: line.item.id, description: line.description, unitPrice: line.lineTotal, quantity: 1, lineTotal: line.lineTotal }));
  const invoice = buildInvoice(id, customerId, salesperson, "MemoConversion", memoId, invoiceLines, { currency, taxRateId });
  store.insert(invoice);
  await markItemsSold(
    lines.map((l) => l.item),
    `Memo ${memoId} converted — invoiced as ${id}.`,
    actor,
    id
  );
  return invoice;
}

export async function voidInvoice(id: string): Promise<Invoice | undefined> {
  return store.update(id, { status: "Void" });
}
