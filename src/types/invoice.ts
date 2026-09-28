/**
 * §17 — revenue-recognizing document, and one of only two sales documents (the other is the Memo).
 * Two sources converge here: a direct sale, or a converted Memo (§13.7 — conversion is the only path
 * from memo to invoice). Quotes and Sales Orders were removed; invoices stored with the old
 * "SalesOrder" source still read back fine, they simply no longer link anywhere.
 */
export type InvoiceStatus = "Open" | "Partially paid" | "Paid" | "Void";
export type InvoiceSource = "Direct" | "MemoConversion";

export interface InvoiceLine {
  id: string;
  itemId: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
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
}
