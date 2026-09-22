import type { SalesOrder } from "@/types/salesOrder";

/** W-3035 is already "Reserved" in mockInventory.ts (customer hold pending deposit) — reused here so seed data stays consistent without editing inventory. */
export const mockSalesOrders: SalesOrder[] = [
  {
    id: "SO-5001",
    customerId: "C-2001",
    lines: [{ id: "SO-5001-L1", itemId: "W-3035", priceBasis: "Our price $7,100", quantity: 1, lineTotal: 7100, fulfilled: false }],
    salesperson: "Devesh Rao",
    orderedAt: "2026-09-12",
    status: "Allocated",
    currency: "USD",
    fxRateToBase: 1,
    invoiceIds: [],
  },
];
