import type { Payment } from "@/types/payment";

/**
 * Deposit account ids match the fixed ones seeded in masterDataStore. Between them these cover the
 * states the Payments page has to distinguish: cleared, still in transit, and one carrying a processor
 * fee that did not reduce the receivable.
 */
export const mockPayments: Payment[] = [
  {
    id: "PMT-6001",
    invoiceId: "INV-3312",
    customerId: "C-2006",
    method: "Wire",
    amount: 2950,
    reference: "WIRE-88210",
    receivedAt: "2026-09-05",
    depositAccountId: "acct-operating",
    clearedAt: "2026-09-06",
  },
  {
    id: "PMT-6002",
    invoiceId: "INV-3298",
    customerId: "C-2003",
    method: "Card",
    amount: 3900,
    reference: "AUTH-44192",
    receivedAt: "2026-09-08",
    depositAccountId: "acct-processor",
    // The customer paid 3,900 and the invoice settled in full; the processor's cut is a cost to the
    // business, recorded here rather than netted off the receivable.
    feeAmount: 113.4,
    notes: "2.9% + $0.30 processing fee.",
    // Deliberately not cleared — the Payments page has to show money still in transit.
  },
];
