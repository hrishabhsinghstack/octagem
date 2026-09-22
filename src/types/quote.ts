/**
 * §15 — a proposal, not a commitment: creating or holding a quote never touches inventory status
 * (unlike Memo or Sales Order allocation). Single-version only for this pass — no revision
 * history (blueprint §15.2's "Revised" state is out of scope, flagged in the plan).
 */
export type QuoteStatus = "Open" | "Accepted" | "Declined";

export interface QuoteLine {
  id: string;
  itemId: string;
  priceBasis: string;
  quantity: number;
  lineTotal: number;
}

export interface Quote {
  id: string;
  customerId: string;
  lines: QuoteLine[];
  salesperson: string;
  notes: string;
  issuedAt: string;
  expiresAt: string;
  status: QuoteStatus;
  /** ISO code from the "currencies" master list. */
  currency: string;
  /** Captured at creation from the currency's current rate — never re-derived later. See lib/currency.ts. */
  fxRateToBase: number;
  /** A "taxRates" master list entry id, if tax applies to this quote. */
  taxRateId?: string;
  /** Set once Accept creates the linked Sales Order. */
  salesOrderId?: string;
}
