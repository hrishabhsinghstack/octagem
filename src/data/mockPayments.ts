import type { Payment } from "@/types/payment";

export const mockPayments: Payment[] = [
  { id: "PMT-6001", invoiceId: "INV-3312", customerId: "C-2006", method: "Wire", amount: 2950, reference: "WIRE-88210", receivedAt: "2026-09-05" },
  { id: "PMT-6002", invoiceId: "INV-3298", customerId: "C-2003", method: "Bank Transfer", amount: 3900, reference: "ACH-44192", receivedAt: "2026-09-08" },
];
