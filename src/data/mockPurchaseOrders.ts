import { NO_CHARGES, type LineDestination, type PurchaseOrder, type PurchaseOrderLine } from "@/types/purchaseOrder";

const line = (id: string, description: string, category: PurchaseOrderLine["category"], expectedQty: number, expectedCost: number, receivedQty = 0): PurchaseOrderLine => ({
  id,
  description,
  category,
  lineType: "Goods",
  unit: "pcs",
  expectedQty,
  expectedCost,
  receivedQty,
  receivedItemIds: [],
  destination: { kind: "Stock" },
});

/** A job invoice line — already "received", because an invoice means the goods or work were delivered. */
const jobLine = (id: string, description: string, fields: Pick<PurchaseOrderLine, "lineType" | "bucket" | "unit" | "expectedQty" | "expectedCost">, jobId: string): PurchaseOrderLine => {
  const destination: LineDestination = { kind: "Job", jobId };
  return { id, description, ...fields, receivedQty: fields.expectedQty, receivedItemIds: [], destination };
};

const stockPo = { documentType: "PurchaseOrder" as const, charges: NO_CHARGES, tax: { amount: 0, recoverable: true }, entryMethod: "Typed" as const };

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: "PO-3001",
    vendorId: "V-1001",
    status: "Sent",
    issuedAt: "2026-09-10",
    expectedDate: "2026-09-24",
    notes: "GIA-certified rounds, 1.0–1.5ct range.",
    currency: "USD",
    fxRateToBase: 1,
    lines: [line("PO-3001-L1", "Round brilliant, F-G/VS, GIA", "Diamond", 3, 6500)],
    ...stockPo,
  },
  {
    id: "PO-3002",
    vendorId: "V-1002",
    status: "Partially received",
    issuedAt: "2026-08-28",
    expectedDate: "2026-09-12",
    notes: "18K findings and mountings for the bridal line.",
    currency: "USD",
    fxRateToBase: 1,
    lines: [line("PO-3002-L1", "18K white gold ring mountings", "Jewelry", 5, 850, 2)],
    ...stockPo,
  },
  {
    id: "PO-3003",
    vendorId: "V-1003",
    status: "Draft",
    issuedAt: "2026-09-19",
    expectedDate: "2026-10-05",
    notes: "Pre-owned steel sport watches, authenticated before shipment.",
    currency: "EUR",
    fxRateToBase: 0.92,
    lines: [line("PO-3003-L1", "Pre-owned steel chronograph", "Watch", 2, 4200)],
    ...stockPo,
  },
  {
    id: "PO-3004",
    vendorId: "V-1001",
    status: "Received",
    issuedAt: "2026-09-22",
    expectedDate: "2026-09-21",
    notes: "Melee for the halo collection.",
    currency: "USD",
    fxRateToBase: 1,
    documentType: "VendorInvoice",
    vendorInvoiceNumber: "CDS-77812",
    vendorInvoiceDate: "2026-09-21",
    charges: { ...NO_CHARGES, shipping: 45, insurance: 30 },
    tax: { amount: 0, recoverable: true },
    entryMethod: "Typed",
    lines: [jobLine("PO-3004-L1", "Round melee 1.3mm G-H/VS, 2.40 ct", { lineType: "Goods", bucket: "Stones", unit: "ct", expectedQty: 2.4, expectedCost: 650 }, "JO-0001")],
  },
  {
    // The caster's monthly bill: castings for two jobs on one invoice.
    id: "PO-3005",
    vendorId: "V-1002",
    status: "Received",
    issuedAt: "2026-10-02",
    expectedDate: "2026-09-30",
    notes: "September casting statement.",
    currency: "USD",
    fxRateToBase: 1,
    documentType: "VendorInvoice",
    vendorInvoiceNumber: "MMW-2026-09",
    vendorInvoiceDate: "2026-09-30",
    charges: NO_CHARGES,
    tax: { amount: 0, recoverable: true },
    entryMethod: "Typed",
    lines: [
      jobLine("PO-3005-L1", "18K white gold, halo ring castings", { lineType: "Metal", bucket: "Metal", unit: "g", expectedQty: 28, expectedCost: 72 }, "JO-0001"),
      jobLine("PO-3005-L2", "Casting & finishing, halo rings ×5", { lineType: "Service", bucket: "Casting", unit: "pcs", expectedQty: 5, expectedCost: 40 }, "JO-0001"),
      jobLine("PO-3005-L3", "18K yellow gold, pendant castings", { lineType: "Metal", bucket: "Metal", unit: "g", expectedQty: 12, expectedCost: 72 }, "JO-0002"),
    ],
  },
];
