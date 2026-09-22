/**
 * §16 — the commitment stage between "customer wants this" and "this is invoiced." Adding a line
 * moves the item to Reserved (a pragmatic simplification of blueprint §7.7's Hold/Allocation/
 * Custody-transfer distinction, per OCTAGEM-BLUEPRINT.md §7.7 and this plan's scope note).
 */
export type SalesOrderStatus = "Draft" | "Allocated" | "Partially fulfilled" | "Fulfilled" | "Invoiced" | "Cancelled";

export interface SalesOrderLine {
  id: string;
  itemId: string;
  priceBasis: string;
  quantity: number;
  lineTotal: number;
  fulfilled: boolean;
}

export interface SalesOrder {
  id: string;
  customerId: string;
  sourceQuoteId?: string;
  lines: SalesOrderLine[];
  salesperson: string;
  orderedAt: string;
  status: SalesOrderStatus;
  /** ISO code from the "currencies" master list. */
  currency: string;
  /** Captured at creation from the currency's current rate — never re-derived later. See lib/currency.ts. */
  fxRateToBase: number;
  /** Set once every line has been invoiced. */
  invoiceIds: string[];
}
