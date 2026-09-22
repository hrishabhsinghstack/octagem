import { getById as getInvoiceById, update as updateInvoiceRecord } from "@/lib/store/invoiceStore";
import * as store from "@/lib/store/paymentStore";
import type { Payment, PaymentMethod } from "@/types/payment";

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
}

export async function recordPayment(payload: RecordPaymentPayload): Promise<Payment | undefined> {
  const invoice = getInvoiceById(payload.invoiceId);
  if (!invoice) return undefined;

  const payment: Payment = {
    id: store.nextPaymentId(),
    invoiceId: payload.invoiceId,
    customerId: invoice.customerId,
    method: payload.method,
    amount: payload.amount,
    reference: payload.reference,
    receivedAt: new Date().toISOString().slice(0, 10),
  };
  store.insert(payment);

  const paidAmount = Math.min(invoice.total, invoice.paidAmount + payload.amount);
  updateInvoiceRecord(invoice.id, { paidAmount, status: paidAmount >= invoice.total ? "Paid" : "Partially paid" });

  return payment;
}
