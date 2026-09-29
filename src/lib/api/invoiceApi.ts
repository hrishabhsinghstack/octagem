import { getCurrentFxRate, getTaxRatePercent } from "@/lib/currency";
import { getById as getItem, update as updateItem } from "@/lib/store/inventoryStore";
import * as store from "@/lib/store/invoiceStore";
import { createVendorBillsForConsignedSales } from "@/lib/api/vendorBillApi";
import { canDeleteInvoice, canEditInvoice, canIssueInvoice, canSendInvoice, invoiceTotals, lineTotal as computeLineTotal, stockLines } from "@/lib/invoice";
import type { Invoice, InvoiceLine, InvoiceSend } from "@/types/invoice";
import type { InventoryItem } from "@/types/inventory";

/** Thrown when an action doesn't fit the invoice's state — editing an issued invoice, issuing a draft twice. */
export class InvoiceStateError extends Error {}

export async function listInvoices(): Promise<Invoice[]> {
  return [...store.getAll()];
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  return store.getById(id);
}

/* ------------------------------------------------------------------ line input */

/**
 * A line as the editor supplies it. `itemId` present means it sells stock; absent means a free-text
 * charge (a service, a repair, a piece never stocked) with no inventory side effect.
 */
export interface InvoiceLineInput {
  itemId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function toLines(invoiceId: string, inputs: InvoiceLineInput[]): InvoiceLine[] {
  return inputs.map((input, index) => ({
    id: `${invoiceId}-L${index + 1}`,
    itemId: input.itemId,
    description: input.description,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineTotal: computeLineTotal(input.quantity, input.unitPrice),
  }));
}

/* ------------------------------------------------------------------ create / edit */

export interface InvoicePayload {
  customerId: string;
  salesperson: string;
  currency: string;
  taxRateId?: string;
  lines: InvoiceLineInput[];
  discount?: number;
  shipping?: number;
  dueDate?: string;
  notes?: string;
}

function applyPayload(id: string, payload: InvoicePayload, base: Partial<Invoice>): Omit<Invoice, "id"> & { id: string } {
  const lines = toLines(id, payload.lines);
  const amounts = invoiceTotals(lines, {
    taxPercent: getTaxRatePercent(payload.taxRateId),
    discount: payload.discount,
    shipping: payload.shipping,
  });
  const today = new Date().toISOString().slice(0, 10);
  return {
    id,
    customerId: payload.customerId,
    lines,
    subtotal: amounts.subtotal,
    taxRateId: payload.taxRateId,
    tax: amounts.tax,
    discount: amounts.discount,
    shipping: amounts.shipping,
    total: amounts.total,
    status: base.status ?? "Draft",
    sourceType: base.sourceType ?? "Direct",
    sourceId: base.sourceId,
    salesperson: payload.salesperson,
    issuedAt: base.issuedAt ?? today,
    dueDate: payload.dueDate ?? base.dueDate ?? today,
    currency: payload.currency,
    // Struck once, at creation — a draft edited a week later keeps the rate it was quoted at.
    fxRateToBase: base.fxRateToBase ?? getCurrentFxRate(payload.currency),
    paidAmount: base.paidAmount ?? 0,
    notes: payload.notes,
    sentAt: base.sentAt,
    sends: base.sends ?? [],
  };
}

/**
 * Saves an invoice. `issue: false` (the default) leaves it a Draft, which commits no stock and owes
 * nothing; `issue: true` is the counter-sale path that sells the goods immediately.
 */
export async function createInvoice(payload: InvoicePayload, options: { issue?: boolean } = {}, actor = "Jordan Miller"): Promise<Invoice> {
  const id = store.nextInvoiceId();
  const invoice = applyPayload(id, payload, { status: "Draft" });
  store.insert(invoice);
  return options.issue ? ((await issueInvoice(id, actor)) ?? invoice) : invoice;
}

/** Replaces a draft's contents wholesale. Recomputes every amount, so no stale total can survive an edit. */
export async function updateDraftInvoice(id: string, payload: InvoicePayload): Promise<Invoice> {
  const existing = store.getById(id);
  if (!existing) throw new InvoiceStateError(`Invoice ${id} no longer exists.`);
  if (!canEditInvoice(existing)) {
    throw new InvoiceStateError(`${id} has been issued and can no longer be edited. Void it and raise a new invoice instead.`);
  }
  const next = applyPayload(id, payload, existing);
  const saved = store.update(id, next);
  if (!saved) throw new InvoiceStateError(`Could not save ${id}.`);
  return saved;
}

export async function deleteDraftInvoice(id: string): Promise<void> {
  const existing = store.getById(id);
  if (!existing) return;
  if (!canDeleteInvoice(existing)) {
    throw new InvoiceStateError(`${id} has been issued. Void it rather than deleting it, so the record survives.`);
  }
  store.remove(id);
}

/* ------------------------------------------------------------------ issue */

/**
 * §13.5 — the one place inventory is sold and a consigned item's vendor bill is raised. Both the
 * counter sale and a memo conversion funnel through here, so the trigger lives once; keeping it out of
 * creation is what lets a Draft be abandoned with nothing to unwind.
 */
async function sellLines(invoice: Invoice, note: string, actor: string) {
  const today = new Date().toISOString().slice(0, 10);
  const items = stockLines(invoice.lines)
    .map((line) => getItem(line.itemId))
    .filter((item): item is InventoryItem => Boolean(item));

  items.forEach((item) => updateItem(item.id, { status: "Sold" }, { occurredAt: today, type: "SALE", note, actor }));

  const consigned = items.filter((item) => item.ownership === "CONSIGNED_IN" && item.vendorId).map((item) => ({ item, amount: item.consignmentValue ?? 0 }));
  if (consigned.length > 0) await createVendorBillsForConsignedSales(consigned, invoice.id);
}

/**
 * Draft → Open: the sale becomes real. Items flip to Sold here and nowhere else.
 *
 * The availability re-check is the safety net for drafts deliberately not holding stock: two drafts can
 * name the same stone, and without this the second one to issue would sell an item that is already Sold
 * (or out on memo), writing a second SALE movement and booking the same goods twice. The editor's
 * conflict warning is advisory; this is the part that actually cannot be bypassed.
 */
export async function issueInvoice(id: string, actor = "Jordan Miller"): Promise<Invoice | undefined> {
  const invoice = store.getById(id);
  if (!invoice) return undefined;
  if (!canIssueInvoice(invoice)) {
    throw new InvoiceStateError(invoice.lines.length === 0 ? "Add at least one line before issuing this invoice." : `${id} has already been issued.`);
  }

  const unavailable = stockLines(invoice.lines)
    .map((line) => ({ line, item: getItem(line.itemId) }))
    .filter(({ item }) => !item || item.status !== "Available");
  if (unavailable.length > 0) {
    const detail = unavailable
      .map(({ line, item }) => `${item?.code ?? line.itemId} is ${item ? `${item.status.toLowerCase()}` : "no longer in inventory"}`)
      .join("; ");
    throw new InvoiceStateError(`Cannot issue ${id}: ${detail}. Remove the line or pick different stock.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const issued = store.update(id, { status: "Open", issuedAt: today });
  if (!issued) return undefined;
  await sellLines(issued, `Sold and invoiced — ${id}.`, actor);
  return store.getById(id);
}

/* ------------------------------------------------------------------ memo conversion */

export interface MemoConversionLine {
  item: InventoryItem;
  description: string;
  lineTotal: number;
}

/**
 * Conversion issues immediately rather than drafting: the customer has already decided to keep the
 * goods, and the memo's per-line settlement (see memoApi.convertMemo) records a completed sale — a
 * draft here would leave the memo settled against an invoice that might never exist.
 */
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
  const invoice = applyPayload(
    id,
    {
      customerId,
      salesperson,
      currency,
      taxRateId,
      lines: lines.map((line) => ({ itemId: line.item.id, description: line.description, quantity: 1, unitPrice: line.lineTotal })),
    },
    { status: "Open", sourceType: "MemoConversion", sourceId: memoId }
  );
  store.insert(invoice);
  await sellLines(invoice, `Memo ${memoId} converted — invoiced as ${id}.`, actor);
  return store.getById(id) ?? invoice;
}

/* ------------------------------------------------------------------ send / void */

export interface SendInvoicePayload {
  to: string;
  cc?: string;
  subject: string;
  via: InvoiceSend["via"];
  sentBy?: string;
}

/**
 * Records that the invoice went to the customer. There is no mail backend — the compose dialog hands
 * off to the user's own client — so this records the handoff, never delivery. Appends to history rather
 * than overwriting, so a resend is visible.
 */
export async function recordInvoiceSend(id: string, payload: SendInvoicePayload): Promise<Invoice> {
  const invoice = store.getById(id);
  if (!invoice) throw new InvoiceStateError(`Invoice ${id} no longer exists.`);
  if (!canSendInvoice(invoice)) {
    throw new InvoiceStateError(invoice.status === "Draft" ? "Issue this invoice before sending it to the customer." : `${id} is void and cannot be sent.`);
  }

  const sentAt = new Date().toISOString();
  const send: InvoiceSend = {
    id: `${id}-S${invoice.sends.length + 1}`,
    sentAt,
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    via: payload.via,
    sentBy: payload.sentBy ?? "Jordan Miller",
  };
  const saved = store.update(id, { sentAt, sends: [...invoice.sends, send] });
  if (!saved) throw new InvoiceStateError(`Could not record the send for ${id}.`);
  return saved;
}

export async function voidInvoice(id: string): Promise<Invoice | undefined> {
  return store.update(id, { status: "Void" });
}
