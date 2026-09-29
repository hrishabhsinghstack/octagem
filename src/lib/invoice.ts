import type { Invoice, InvoiceLine, InvoiceStatus } from "@/types/invoice";

/**
 * Invoice arithmetic and state rules, kept out of React and out of the store so both the editor's live
 * preview and the API that persists use the same code — a preview that can disagree with what saves is
 * worse than no preview.
 */

/** Money is rounded to cents at every step, so a total never drifts from the sum of what's displayed. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

export interface InvoiceCharges {
  /** Percent, as the master list stores it (8.875, not 0.08875). */
  taxPercent?: number;
  /** Absolute amount off the subtotal, applied before tax. */
  discount?: number;
  shipping?: number;
}

export interface InvoiceAmounts {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
}

/**
 * The one place invoice amounts are computed. Tax is charged on the discounted subtotal, not the gross —
 * a discount reduces what was actually sold, so taxing the pre-discount figure would overcharge. Shipping
 * is added after tax, since it is not part of the goods value being taxed here.
 */
export function invoiceTotals(lines: Pick<InvoiceLine, "lineTotal">[], charges: InvoiceCharges = {}): InvoiceAmounts {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  // A discount cannot exceed the goods, or tax and total go negative.
  const discount = Math.min(roundMoney(Math.max(0, charges.discount ?? 0)), subtotal);
  const shipping = roundMoney(Math.max(0, charges.shipping ?? 0));
  const taxable = subtotal - discount;
  const tax = roundMoney(taxable * ((charges.taxPercent ?? 0) / 100));
  return { subtotal, discount, tax, shipping, total: roundMoney(taxable + tax + shipping) };
}

export function invoiceBalance(invoice: Pick<Invoice, "total" | "paidAmount">): number {
  return roundMoney(invoice.total - invoice.paidAmount);
}

/* ------------------------------------------------------------------ state rules */

/** Issued = the sale is real: inventory has moved and the customer owes money. */
export function isIssued(status: InvoiceStatus): boolean {
  return status !== "Draft" && status !== "Void";
}

/** A draft is the only editable state — an issued invoice is a financial record, amended by Void and reissue. */
export function canEditInvoice(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "Draft";
}

export function canIssueInvoice(invoice: Pick<Invoice, "status" | "lines">): boolean {
  return invoice.status === "Draft" && invoice.lines.length > 0;
}

/** Drafts are deleted outright; anything issued is Voided, so the numbering and the audit trail survive. */
export function canDeleteInvoice(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "Draft";
}

/** Sending a draft would put a document the business hasn't committed to in front of a customer. */
export function canSendInvoice(invoice: Pick<Invoice, "status">): boolean {
  return isIssued(invoice.status);
}

export function canRecordPayment(invoice: Pick<Invoice, "status">): boolean {
  return isIssued(invoice.status) && invoice.status !== "Paid";
}

export function canVoidInvoice(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status !== "Void" && invoice.status !== "Draft";
}

export function isSent(invoice: Pick<Invoice, "sentAt">): boolean {
  return Boolean(invoice.sentAt);
}

/**
 * Issued, still owing money, and never sent — a work list, which is the reason sentAt is a flag rather
 * than a status. Paid invoices are excluded on purpose: a counter sale that was settled on the spot was
 * never going to be emailed, and counting it would leave a number that can never reach zero. Resending
 * a paid invoice as a receipt is still possible, just not chased.
 */
export function isAwaitingSend(invoice: Pick<Invoice, "status" | "sentAt">): boolean {
  return countsTowardsReceivables(invoice) && !invoice.sentAt;
}

/**
 * Whether this invoice counts towards what a customer owes. Draft owes nothing (nothing was sold yet)
 * and Void owes nothing (it was cancelled) — every receivables total has to ask this rather than
 * "not Paid", which would quietly book drafts as revenue.
 */
export function countsTowardsReceivables(invoice: Pick<Invoice, "status">): boolean {
  return isIssued(invoice.status) && invoice.status !== "Paid";
}

/** Issued and not cancelled — what "lifetime invoiced" should sum. */
export function countsAsInvoiced(invoice: Pick<Invoice, "status">): boolean {
  return isIssued(invoice.status);
}

/* ------------------------------------------------------------------ draft overlap */

export interface DraftConflict {
  itemId: string;
  /** The other draft that also claims this item. */
  invoiceId: string;
}

/**
 * Items on this draft that another draft also claims. Because a draft deliberately holds no stock, two
 * people can build drafts around the same stone; this is how that gets surfaced instead of discovered
 * when the second one fails to issue. Non-blocking by design — the honest answer is a warning, since
 * whichever draft issues first legitimately wins.
 */
export function draftItemConflicts(draft: Pick<Invoice, "id" | "lines">, all: Pick<Invoice, "id" | "status" | "lines">[]): DraftConflict[] {
  const mine = new Set(draft.lines.map((line) => line.itemId).filter((id): id is string => Boolean(id)));
  if (mine.size === 0) return [];

  const conflicts: DraftConflict[] = [];
  for (const other of all) {
    if (other.id === draft.id || other.status !== "Draft") continue;
    for (const line of other.lines) {
      if (line.itemId && mine.has(line.itemId)) conflicts.push({ itemId: line.itemId, invoiceId: other.id });
    }
  }
  return conflicts;
}

/** Only inventory-backed lines have stock to move; free-text lines are pure charges. */
export function stockLines(lines: InvoiceLine[]): (InvoiceLine & { itemId: string })[] {
  return lines.filter((line): line is InvoiceLine & { itemId: string } => Boolean(line.itemId));
}
