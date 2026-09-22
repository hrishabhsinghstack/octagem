import type { PurchaseOrder } from "@/types/purchaseOrder";

const line = (id: string, description: string, category: PurchaseOrder["lines"][number]["category"], expectedQty: number, expectedCost: number, receivedQty = 0): PurchaseOrder["lines"][number] => ({
  id,
  description,
  category,
  expectedQty,
  expectedCost,
  receivedQty,
  receivedItemIds: [],
});

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
  },
];
