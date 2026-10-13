/**
 * §12 — scoped to procurement + receiving for this pass. No vendor bill, no AP ledger, no GRNI
 * accrual (that's the Accounting module, §19, which doesn't exist yet). A line tracks expected
 * vs. received quantity/cost and links to the actual InventoryItem(s) created on receipt, so
 * "where did this PO's goods end up" is always answerable.
 *
 * A purchase order also stores a vendor invoice or credit note entered against a Job Order
 * (types/jobOrder.ts): the invoice is the source document, the PO is how it is kept and listed, so
 * Purchasing sees job buying and stock buying in one list. Each line says where it goes — a job, or
 * stock — which is what lets one invoice cover several jobs, or a job cost and a stock parcel at once.
 */
import type { CostBucket } from "@/types/jobOrder";
import type { InventoryCategory } from "@/types/inventory";

export type PurchaseOrderStatus = "Draft" | "Sent" | "Partially received" | "Received" | "Cancelled";

/** "PurchaseOrder" is an order raised by us; the other two are documents the vendor sent, keyed by their own number. */
export type PurchaseDocumentType = "PurchaseOrder" | "VendorInvoice" | "CreditNote";

/**
 * What was bought. Independent of where it goes: Goods (stones, findings, mountings) can be received
 * into stock or charged straight to a job — melee bought for one job never needs a stock number.
 * Metal is bought by weight; Service (CAD, casting, setting, labour) has nothing to receive.
 */
export type PurchaseOrderLineType = "Goods" | "Metal" | "Service";

export type PurchaseUnit = "pcs" | "ct" | "g" | "hrs" | "lot";

export const PURCHASE_UNITS: PurchaseUnit[] = ["pcs", "ct", "g", "hrs", "lot"];

export type LineDestination = { kind: "Stock" } | { kind: "Job"; jobId: string };

export interface PurchaseOrderLine {
  id: string;
  description: string;
  category?: InventoryCategory;
  lineType: PurchaseOrderLineType;
  /** What the cost is for, on job lines. */
  bucket?: CostBucket;
  /** expectedQty is in this unit — grams of gold, carats of melee, hours of labour. */
  unit: PurchaseUnit;
  expectedQty: number;
  /** Per unit, in the document's currency. */
  expectedCost: number;
  receivedQty: number;
  receivedItemIds: string[];
  destination: LineDestination;
}

/** Header-level amounts on top of the lines. Spread over the lines by value when costing a job (landed cost). */
export interface PurchaseCharges {
  shipping: number;
  insurance: number;
  duty: number;
  other: number;
  discount: number;
}

export interface PurchaseTax {
  amount: number;
  /** Recoverable tax (input credit) is not product cost; the amount is still stored so the PO matches the paper. */
  recoverable: boolean;
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
  documentType: PurchaseDocumentType;
  /** Required on VendorInvoice / CreditNote; unique per vendor (see findDuplicateInvoice in lib/job/costing.ts). */
  vendorInvoiceNumber?: string;
  vendorInvoiceDate?: string;
  /** A credit note may name the invoice it reverses. */
  creditForPoId?: string;
  charges: PurchaseCharges;
  tax: PurchaseTax;
  entryMethod: "Typed" | "AIScan";
}

export const NO_CHARGES: PurchaseCharges = { shipping: 0, insurance: 0, duty: 0, other: 0, discount: 0 };
