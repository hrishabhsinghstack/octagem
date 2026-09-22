/**
 * §12 — scoped to procurement + receiving for this pass. No vendor bill, no AP ledger, no GRNI
 * accrual (that's the Accounting module, §19, which doesn't exist yet). A line tracks expected
 * vs. received quantity/cost and links to the actual InventoryItem(s) created on receipt, so
 * "where did this PO's goods end up" is always answerable.
 */
import type { InventoryCategory } from "@/types/inventory";

export type PurchaseOrderStatus = "Draft" | "Sent" | "Partially received" | "Received" | "Cancelled";

export interface PurchaseOrderLine {
  id: string;
  description: string;
  category?: InventoryCategory;
  expectedQty: number;
  expectedCost: number;
  receivedQty: number;
  receivedItemIds: string[];
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  lines: PurchaseOrderLine[];
  status: PurchaseOrderStatus;
  issuedAt: string;
  expectedDate: string;
  notes: string;
  /** ISO code from the "currencies" master list. */
  currency: string;
  /** Captured at creation from the currency's current rate — never re-derived later. See lib/currency.ts. */
  fxRateToBase: number;
}
