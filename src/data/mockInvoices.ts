import type { Invoice } from "@/types/invoice";

/**
 * IDs match the ledger notes already on J-2045 and W-3041 in mockInventory.ts ("Sold and invoiced
 * — INV-3312" / "INV-3298"), written before this module existed as placeholder flavor text — now
 * backed by real records so the two are consistent.
 */
export const mockInvoices: Invoice[] = [
  {
    id: "INV-3312",
    customerId: "C-2006",
    lines: [{ id: "INV-3312-L1", itemId: "J-2045", description: "14K Yellow Gold Tennis Bracelet", unitPrice: 2950, quantity: 1, lineTotal: 2950 }],
    subtotal: 2950,
    tax: 0,
    discount: 0,
    shipping: 0,
    total: 2950,
    status: "Paid",
    sourceType: "MemoConversion",
    sourceId: "M-1006",
    salesperson: "Priya Nair",
    issuedAt: "2026-08-30",
    dueDate: "2026-09-13",
    currency: "USD",
    fxRateToBase: 1,
    paidAmount: 2950,
  },
  {
    id: "INV-3298",
    customerId: "C-2003",
    lines: [{ id: "INV-3298-L1", itemId: "W-3041", description: "Black Bay 58", unitPrice: 3900, quantity: 1, lineTotal: 3900 }],
    subtotal: 3900,
    tax: 0,
    discount: 0,
    shipping: 0,
    total: 3900,
    status: "Paid",
    sourceType: "Direct",
    salesperson: "Devesh Rao",
    issuedAt: "2026-09-02",
    dueDate: "2026-09-16",
    currency: "USD",
    fxRateToBase: 1,
    paidAmount: 3900,
  },
];
