/**
 * §18 — simple for this pass: one payment against one invoice at a time, partials supported.
 * The real many-to-many payment_allocation model is a flagged fast-follow, not built here.
 */

/**
 * A label from the `paymentMethods` master list, not a fixed union — how money arrives varies by market
 * far more than the rest of the sales chain (UPI in India, store credit in retail, a card processor in
 * one showroom and not another). Stored as the label, the same way `currency` stores an ISO code.
 */
export type PaymentMethod = string;

export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  /** The day the money arrived. User-settable — a cheque handed over on Friday is often keyed on Monday. */
  receivedAt: string;
  /**
   * A `depositAccounts` master list entry id: where the money actually landed. Optional because payments
   * recorded before this existed have no answer, and forcing one would invent it.
   */
  depositAccountId?: string;
  /**
   * When the funds actually cleared. Undefined means still in transit — a cheque banked but not cleared,
   * or a card batch not yet settled. Cash is normally recorded cleared on the same day.
   */
  clearedAt?: string;
  /**
   * What the processor or bank took, in the invoice's currency. Recorded separately from `amount` because
   * the customer paid the full amount — the fee is a cost to the business, not a shortfall on the
   * invoice. `amount` is always what settles the receivable; this never reduces it.
   */
  feeAmount?: number;
  notes?: string;
}
