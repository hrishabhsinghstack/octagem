import { roundMoney } from "@/lib/invoice";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { Payment } from "@/types/payment";

/**
 * Payment arithmetic and validation, kept out of React and out of the store so the dialog's live
 * feedback and the API that persists apply the same rules.
 */

export interface PaymentDraft {
  amount: number;
  receivedAt: string;
  clearedAt?: string;
  feeAmount?: number;
}

export interface PaymentProblem {
  field: "amount" | "receivedAt" | "clearedAt" | "feeAmount";
  message: string;
}

/**
 * Today as the user's own calendar date. Not `toISOString()`, which is the UTC date: in India that is
 * still yesterday until 05:30, so a payment keyed "today" just after midnight would be refused as future.
 */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** What is still owed on an invoice, to the cent. */
export function remainingBalance(invoice: Pick<Invoice, "total" | "paidAmount">): number {
  return roundMoney(invoice.total - invoice.paidAmount);
}

/**
 * Validates a payment against the invoice it settles. Overpayment is refused rather than absorbed:
 * silently capping it would leave the books agreeing with nothing the customer sent, and the honest
 * outcome is to tell the user the figure is wrong.
 */
export function validatePayment(draft: PaymentDraft, invoice: Pick<Invoice, "total" | "paidAmount">, today = localToday()): PaymentProblem[] {
  const problems: PaymentProblem[] = [];
  const remaining = remainingBalance(invoice);

  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    problems.push({ field: "amount", message: "Enter an amount greater than zero." });
  } else if (roundMoney(draft.amount) > remaining) {
    problems.push({ field: "amount", message: `That is more than the ${remaining.toFixed(2)} still outstanding.` });
  }

  if (!draft.receivedAt) {
    problems.push({ field: "receivedAt", message: "When did the money arrive?" });
  } else if (draft.receivedAt > today) {
    // Booking money that hasn't arrived overstates cash on hand.
    problems.push({ field: "receivedAt", message: "A payment cannot be received in the future." });
  }

  if (draft.clearedAt && draft.receivedAt && draft.clearedAt < draft.receivedAt) {
    problems.push({ field: "clearedAt", message: "Funds cannot clear before they were received." });
  }

  if (draft.feeAmount !== undefined) {
    if (!Number.isFinite(draft.feeAmount) || draft.feeAmount < 0) {
      problems.push({ field: "feeAmount", message: "A fee cannot be negative." });
    } else if (draft.feeAmount > draft.amount) {
      problems.push({ field: "feeAmount", message: "The fee cannot exceed the payment itself." });
    }
  }

  return problems;
}

/**
 * The invoice status implied by what has been paid. Derived rather than stored so it can never drift
 * from the payment records, and deliberately never touches Draft or Void — an unissued or cancelled
 * invoice is not "unpaid", it is outside the payment story altogether.
 */
export function statusAfterPayment(current: InvoiceStatus, total: number, paidAmount: number): InvoiceStatus {
  if (current === "Draft" || current === "Void") return current;
  if (roundMoney(paidAmount) <= 0) return "Open";
  return roundMoney(paidAmount) >= roundMoney(total) ? "Paid" : "Partially paid";
}

/** What actually reached the bank, after the processor took its cut. Reporting only — never the receivable. */
export function netReceived(payment: Pick<Payment, "amount" | "feeAmount">): number {
  return roundMoney(payment.amount - (payment.feeAmount ?? 0));
}

export function hasCleared(payment: Pick<Payment, "clearedAt">): boolean {
  return Boolean(payment.clearedAt);
}

/** Money recorded but not yet confirmed by the bank — the figure a cash position should hold back. */
export function unclearedTotal(payments: Pick<Payment, "amount" | "clearedAt">[]): number {
  return roundMoney(payments.filter((payment) => !payment.clearedAt).reduce((sum, payment) => sum + payment.amount, 0));
}

export function totalFees(payments: Pick<Payment, "feeAmount">[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + (payment.feeAmount ?? 0), 0));
}
