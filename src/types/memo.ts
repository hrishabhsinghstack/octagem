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
  /** Set once Convert creates the linked Invoice. */
  invoiceId?: string;
}
