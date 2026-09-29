/**
 * §17 — revenue-recognizing document, and one of only two sales documents (the other is the Memo).
 * Two sources converge here: a direct sale, or a converted Memo (§13.7 — conversion is the only path
 * from memo to invoice). Quotes and Sales Orders were removed; invoices stored with the old
 * "SalesOrder" source still read back fine, they simply no longer link anywhere.
 */

/**
 * Draft → Open → Partially paid → Paid, with Void as the exit from any issued state.
 *
 * Draft is deliberately inert: it commits no inventory and owes no money. Items flip to Sold and
 * consignment vendor bills are raised at `issueInvoice`, not at creation — so abandoning a draft costs
 * nothing to unwind. The trade is that two drafts can name the same stone; `draftItemConflicts` in
 * lib/invoice.ts surfaces that rather than locking stock.
 *
 * Anything summing what a customer owes must exclude Draft. "Not Paid and not Void" is no longer the
 * same question as "outstanding".
 */
export type InvoiceStatus = "Draft" | "Open" | "Partially paid" | "Paid" | "Void";
export type InvoiceSource = "Direct" | "MemoConversion";

export interface InvoiceLine {
  id: string;
  /**
   * The stock item this line sells. Absent on a free-text line — a service, a repair, a making or
   * setting charge, a piece that was never stocked. Free lines carry their own description and price
   * and have no inventory side effects, so issuing an invoice never tries to sell them.
   */
  itemId?: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/**
 * One delivery of the invoice to the customer. History rather than a single timestamp, because
 * "we sent it twice and they still say it never arrived" is the conversation this has to answer.
 */
export interface InvoiceSend {
  id: string;
  /** ISO datetime — sends are same-day events, so the time matters, unlike issuedAt. */
  sentAt: string;
  to: string;
  cc?: string;
  subject: string;
  /**
   * How it left. "mailto" handed off to the user's own mail client — there is no mail backend, so the
   * app can confirm the handoff, never the delivery. "manual" is the user asserting they sent it
   * another way. A real transport becomes a third value without reshaping anything.
   */
  via: "mailto" | "manual";
  sentBy: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  lines: InvoiceLine[];
  subtotal: number;
  /** A "taxRates" master list entry id — the tax dollar amount below is computed from it, not typed. */
  taxRateId?: string;
  tax: number;
  discount: number;
  shipping: number;
  total: number;
  status: InvoiceStatus;
  sourceType: InvoiceSource;
  sourceId?: string;
  salesperson: string;
  issuedAt: string;
  dueDate: string;
  /** ISO code from the "currencies" master list. */
  currency: string;
  /** Captured at creation from the currency's current rate — never re-derived later. See lib/currency.ts. */
  fxRateToBase: number;
  /** Kept in sync from Payment records — see paymentApi.ts. */
  paidAmount: number;
  /** Free-text terms, warranty or disclosure printed on the document. */
  notes?: string;
  /**
   * When the invoice last went to the customer. A flag, not a status: an invoice can be both sent and
   * partially paid, and "issued but never sent" is a list someone has to chase. Undefined means never sent.
   */
  sentAt?: string;
  sends: InvoiceSend[];
}
