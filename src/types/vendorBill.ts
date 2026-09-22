/**
 * §19.4 — AP's mirror of Invoice (§17), kept as a structurally separate type rather than a
 * polymorphic "payment" model, per the blueprint's explicit AR/AP separation. This phase only
 * creates bills automatically when a consigned item sells (§13.5) — manual vendor bill creation and
 * full PO-to-bill matching are later Purchasing work, flagged out of scope.
 */
export type VendorBillStatus = "Open" | "Partially paid" | "Paid" | "Void";
export type VendorBillSource = "MemoInConversion";

export interface VendorBillLine {
  id: string;
  itemId: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface VendorBill {
  id: string;
  vendorId: string;
  lines: VendorBillLine[];
  subtotal: number;
  total: number;
  status: VendorBillStatus;
  sourceType: VendorBillSource;
  /** The invoice whose sale of a consigned item triggered this bill. */
  sourceId: string;
  issuedAt: string;
  dueDate: string;
  /** ISO code from the "currencies" master list — defaults to the vendor's own currency. */
  currency: string;
  fxRateToBase: number;
  /** Kept in sync from VendorPayment records — see vendorBillApi.ts. */
  paidAmount: number;
}
