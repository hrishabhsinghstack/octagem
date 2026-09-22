/**
 * §18 — simple for this pass: one payment against one invoice at a time, partials supported.
 * The real many-to-many payment_allocation model is a flagged fast-follow, not built here.
 */
export type PaymentMethod = "Cash" | "Cheque" | "Bank Transfer" | "Wire" | "Card";

export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  receivedAt: string;
}
