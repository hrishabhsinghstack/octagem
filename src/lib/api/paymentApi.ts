import { canRecordPayment } from "@/lib/invoice";
import { localToday, remainingBalance, statusAfterPayment, validatePayment } from "@/lib/payment";
import { roundMoney } from "@/lib/invoice";
import { getById as getInvoiceById, update as updateInvoiceRecord } from "@/lib/store/invoiceStore";
import * as store from "@/lib/store/paymentStore";
import type { Payment, PaymentMethod } from "@/types/payment";

/** Thrown when a payment doesn't fit the invoice — overpaid, or against something unissued or void. */
export class PaymentError extends Error {}

export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  return store.listByInvoice(invoiceId);
}

export async function listPayments(): Promise<Payment[]> {
  return [...store.getAll()];
}

export interface RecordPaymentPayload {
  invoiceId: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  depositAccountId?: string;
  /** Defaults to today when the dialog doesn't say otherwise. */
  receivedAt?: string;
  clearedAt?: string;
  feeAmount?: number;
  notes?: string;
}

export async function recordPayment(payload: RecordPaymentPayload): Promise<Payment> {
  const invoice = getInvoiceById(payload.invoiceId);
  if (!invoice) throw new PaymentError(`Invoice ${payload.invoiceId} no longer exists.`);
  if (!canRecordPayment(invoice)) {
    throw new PaymentError(
      invoice.status === "Draft"
        ? "Issue this invoice before taking payment against it."
        : invoice.status === "Paid"
          ? `${invoice.id} is already settled.`
          : `${invoice.id} is void — nothing is owed on it.`
    );
  }

  const receivedAt = payload.receivedAt ?? localToday();
  const problems = validatePayment({ amount: payload.amount, receivedAt, clearedAt: payload.clearedAt, feeAmount: payload.feeAmount }, invoice);
  // The dialog shows these per field; anyone calling the API directly gets them joined.
  if (problems.length > 0) throw new PaymentError(problems.map((problem) => problem.message).join(" "));

  const payment: Payment = {
    id: store.nextPaymentId(),
    invoiceId: payload.invoiceId,
    customerId: invoice.customerId,
    method: payload.method,
    amount: roundMoney(payload.amount),
    reference: payload.reference,
    receivedAt,
    depositAccountId: payload.depositAccountId,
    clearedAt: payload.clearedAt,
    // A zero fee is the same as none; storing it would put "Fee $0.00" on every cash payment.
    feeAmount: payload.feeAmount ? roundMoney(payload.feeAmount) : undefined,
    notes: payload.notes?.trim() || undefined,
  };
  store.insert(payment);

  // The one place invoice payment state is written. Derived from the running total rather than nudged,
  // so it can never drift from the payment records behind it.
  const paidAmount = roundMoney(invoice.paidAmount + payment.amount);
  updateInvoiceRecord(invoice.id, { paidAmount, status: statusAfterPayment(invoice.status, invoice.total, paidAmount) });

  return payment;
}

/**
 * Settles the whole outstanding balance in one action — the common counter case, where asking someone to
 * retype a figure the system already knows is just an opportunity to mistype it.
 */
export async function markInvoicePaidInFull(invoiceId: string, payload: Omit<RecordPaymentPayload, "invoiceId" | "amount">): Promise<Payment> {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) throw new PaymentError(`Invoice ${invoiceId} no longer exists.`);

  const remaining = remainingBalance(invoice);
  if (remaining <= 0) throw new PaymentError(`${invoiceId} has nothing outstanding.`);

  return recordPayment({ ...payload, invoiceId, amount: remaining });
}

/** Marks a payment as settled by the bank. Cash is usually cleared on arrival; a cheque is not. */
export async function markPaymentCleared(paymentId: string, clearedAt = localToday()): Promise<Payment> {
  const payment = store.getById(paymentId);
  if (!payment) throw new PaymentError("That payment no longer exists.");
  if (clearedAt < payment.receivedAt) throw new PaymentError("Funds cannot clear before they were received.");

  const updated = store.update(paymentId, { clearedAt });
  if (!updated) throw new PaymentError("Could not update that payment.");
  return updated;
}
