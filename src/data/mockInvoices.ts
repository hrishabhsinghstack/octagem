import type { Invoice } from "@/types/invoice";

/**
 * IDs match the ledger notes already on J-2045 and W-3041 in mockInventory.ts ("Sold and invoiced
 * — INV-3312" / "INV-3298"), written before this module existed as placeholder flavor text — now
 * backed by real records so the two are consistent.
 *
 * The set deliberately covers every lifecycle shape, or the states are invisible in the demo: a paid
 * invoice that was emailed, a paid one that never was, an open unsent one with a free-text charge
 * alongside stock, and a draft holding an item that is still Available.
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
    sentAt: "2026-08-30T14:20:00.000Z",
    sends: [
      {
        id: "INV-3312-S1",
        sentAt: "2026-08-30T14:20:00.000Z",
        to: "farah@regalgems.example",
        subject: "Invoice INV-3312 from OctaGem Demo Co.",
        via: "mailto",
        sentBy: "Priya Nair",
      },
    ],
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
    // Collected over the counter, so it was never emailed — "Paid but never sent" is a real combination.
    sends: [],
  },
  {
    id: "INV-3320",
    customerId: "C-2002",
    // A pure service invoice: labour and freight, no goods. Nothing in inventory moves, which is the
    // case free-text lines exist for — and it keeps this record from claiming a stone some other
    // record already accounts for.
    lines: [
      { id: "INV-3320-L1", description: "Resizing and rhodium finish — 3 pieces", unitPrice: 60, quantity: 3, lineTotal: 180 },
      { id: "INV-3320-L2", description: "Laser inscription", unitPrice: 75, quantity: 1, lineTotal: 75 },
    ],
    subtotal: 255,
    tax: 0,
    discount: 0,
    shipping: 45,
    total: 300,
    status: "Open",
    sourceType: "Direct",
    salesperson: "Devesh Rao",
    issuedAt: "2026-09-24",
    dueDate: "2026-10-08",
    currency: "USD",
    fxRateToBase: 1,
    paidAmount: 0,
    notes: "Workshop charges for pieces collected 24 Sept.",
    // Issued but never sent — the list someone has to chase.
    sends: [],
  },
  {
    id: "INV-3321",
    customerId: "C-2001",
    // D-1042 is still Available: a draft commits no stock until it is issued.
    lines: [
      { id: "INV-3321-L1", itemId: "D-1042", description: "D-1042 · 1.21ct Round Brilliant", unitPrice: 9400, quantity: 1, lineTotal: 9400 },
      { id: "INV-3321-L2", description: "Custom platinum setting — labour", unitPrice: 650, quantity: 1, lineTotal: 650 },
    ],
    subtotal: 10050,
    tax: 0,
    discount: 250,
    shipping: 0,
    total: 9800,
    status: "Draft",
    sourceType: "Direct",
    salesperson: "Devesh Rao",
    issuedAt: "2026-09-28",
    dueDate: "2026-10-12",
    currency: "USD",
    fxRateToBase: 1,
    paidAmount: 0,
    // Customer-facing: `notes` prints on the document and seeds the covering email, so it is never a
    // place for an internal reminder.
    notes: "Setting to be completed to the customer's final ring size. 30-day appraisal included.",
    sends: [],
  },
];
