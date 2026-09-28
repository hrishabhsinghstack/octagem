/**
 * §13 — a memo is a custody document, never a financial one: no Paid/Net Due/Sales Tax here.
 * Field coverage matches DATA-FIELD-CATALOG.md §5 (the legacy memorandum screen and printed
 * document), minus the fields that belong to a sale, not a custody transfer.
 */
export type MemoStatus = "Open" | "Returned" | "Converted";
export type MemoRisk = "Healthy" | "Due soon" | "Overdue";

export interface MemoLine {
  id: string;
  itemId: string;
  /** The price basis quoted at memo time (e.g. "% off Rap", or a metal+making-charge build-up) — not a locked sale price. */
  priceBasis: string;
  quantity: number;
  lineTotal: number;
  /**
   * Set once this line stops being custody: the customer bought it, or sent it back. Settled lines
   * stay on the memo rather than being removed — a custody document has to keep showing everything
   * that went out — but they no longer count towards exposure. Undefined means still out there.
   */
  settledAs?: "Invoiced" | "Returned";
  /** The invoice this line became. Set together with settledAs: "Invoiced". */
  invoiceId?: string;
}

export interface MemoRecord {
  id: string;
  customerId: string;
  /** Denormalized display name, kept in sync at issue time — avoids a Customer lookup everywhere counterparty is rendered. */
  counterparty: string;
  memoToAddress: string;
  shipToAddress: string;
  contact: string;
  phone: string;
  poNumber?: string;
  shipVia?: string;
  terms?: string;
  trackingNumber?: string;
  salesperson: string;
  salespersonCommissionPct?: number;
  salesperson2?: string;
  salesperson2CommissionPct?: number;
  lines: MemoLine[];
  issuedAt: string;
  dueDate: string;
  status: MemoStatus;
  /**
   * The invoice that closed this memo out — set only when the last unsettled line converts. A memo
   * converted in instalments carries the per-line invoiceId for the earlier ones; this is the
   * "show me the sale" shortcut for the common whole-memo case, not the full record.
   */
  invoiceId?: string;
}
