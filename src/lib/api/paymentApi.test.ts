import { createInvoice, getInvoice, voidInvoice, type InvoicePayload } from "@/lib/api/invoiceApi";
import { PaymentError, listPaymentsForInvoice, markInvoicePaidInFull, markPaymentCleared, recordPayment } from "@/lib/api/paymentApi";
import { localToday } from "@/lib/payment";
import { installMemoryStorage } from "@/test/memoryStorage";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  installMemoryStorage();
});

const payload = (over: Partial<InvoicePayload> = {}): InvoicePayload => ({
  customerId: "C-2001",
  salesperson: "Devesh Rao",
  currency: "USD",
  lines: [{ description: "Service", quantity: 1, unitPrice: 1_000 }],
  ...over,
});

/** An issued invoice for 1,000 with nothing paid — the starting point for most of these. */
const openInvoice = async (total = 1_000) => createInvoice(payload({ lines: [{ description: "Service", quantity: 1, unitPrice: total }] }), { issue: true });

describe("recordPayment", () => {
  it("records a partial payment and moves the invoice to Partially paid", async () => {
    const invoice = await openInvoice();
    await recordPayment({ invoiceId: invoice.id, method: "Wire", amount: 400, reference: "W-1" });

    const after = await getInvoice(invoice.id);
    expect(after?.paidAmount).toBe(400);
    expect(after?.status).toBe("Partially paid");
  });

  it("settles the invoice when the balance is paid off", async () => {
    const invoice = await openInvoice();
    await recordPayment({ invoiceId: invoice.id, method: "Wire", amount: 600, reference: "W-1" });
    await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 400, reference: "" });

    const after = await getInvoice(invoice.id);
    expect(after?.paidAmount).toBe(1_000);
    expect(after?.status).toBe("Paid");
  });

  it("stores the deposit account, cleared date, fee and notes", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({
      invoiceId: invoice.id,
      method: "Card",
      amount: 500,
      reference: "AUTH-9",
      depositAccountId: "acct-processor",
      receivedAt: "2026-09-20",
      clearedAt: "2026-09-22",
      feeAmount: 14.5,
      notes: "  2.9% fee  ",
    });

    expect(payment).toMatchObject({
      depositAccountId: "acct-processor",
      receivedAt: "2026-09-20",
      clearedAt: "2026-09-22",
      feeAmount: 14.5,
      notes: "2.9% fee",
    });
  });

  it("does not store a zero fee — every cash payment would otherwise print 'Fee $0.00'", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "", feeAmount: 0 });
    expect(payment.feeAmount).toBeUndefined();
  });

  it("does not let a fee reduce what the invoice counts as paid", async () => {
    const invoice = await openInvoice();
    await recordPayment({ invoiceId: invoice.id, method: "Card", amount: 1_000, reference: "", feeAmount: 29 });

    const after = await getInvoice(invoice.id);
    // The customer paid 1,000; the processor's cut is the business's cost, not a shortfall.
    expect(after?.paidAmount).toBe(1_000);
    expect(after?.status).toBe("Paid");
  });

  it("defaults the received date to today", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "" });
    expect(payment.receivedAt).toBe(localToday());
  });

  it("stamps the invoice's customer onto the payment", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "" });
    expect(payment.customerId).toBe(invoice.customerId);
  });

  it("refuses to overpay", async () => {
    const invoice = await openInvoice();
    await expect(recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 1_500, reference: "" })).rejects.toThrow(PaymentError);
  });

  it("refuses to overpay across several payments", async () => {
    const invoice = await openInvoice();
    await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 700, reference: "" });
    await expect(recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 400, reference: "" })).rejects.toThrow(/more than/i);
  });

  it("refuses payment against a draft", async () => {
    const draft = await createInvoice(payload());
    await expect(recordPayment({ invoiceId: draft.id, method: "Cash", amount: 100, reference: "" })).rejects.toThrow(/issue this invoice/i);
  });

  it("refuses payment against a void invoice", async () => {
    const invoice = await openInvoice();
    await voidInvoice(invoice.id);
    await expect(recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "" })).rejects.toThrow(/void/i);
  });

  it("refuses payment against an already settled invoice", async () => {
    const invoice = await openInvoice();
    await markInvoicePaidInFull(invoice.id, { method: "Cash", reference: "" });
    await expect(recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 1, reference: "" })).rejects.toThrow(/settled/i);
  });

  it("refuses a future received date", async () => {
    const invoice = await openInvoice();
    await expect(recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "", receivedAt: "2099-01-01" })).rejects.toThrow(/future/i);
  });

  it("refuses an invoice that no longer exists", async () => {
    await expect(recordPayment({ invoiceId: "INV-nope", method: "Cash", amount: 1, reference: "" })).rejects.toThrow(/no longer exists/i);
  });

  it("does not record anything when validation fails", async () => {
    const invoice = await openInvoice();
    await expect(recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 9_999, reference: "" })).rejects.toThrow();
    expect(await listPaymentsForInvoice(invoice.id)).toHaveLength(0);
    expect((await getInvoice(invoice.id))?.paidAmount).toBe(0);
  });
});

describe("markInvoicePaidInFull", () => {
  it("settles the exact outstanding balance in one action", async () => {
    const invoice = await openInvoice();
    const payment = await markInvoicePaidInFull(invoice.id, { method: "Cash", reference: "" });

    expect(payment.amount).toBe(1_000);
    expect((await getInvoice(invoice.id))?.status).toBe("Paid");
  });

  it("settles only the remainder after a partial payment", async () => {
    const invoice = await openInvoice();
    await recordPayment({ invoiceId: invoice.id, method: "Wire", amount: 250, reference: "" });
    const payment = await markInvoicePaidInFull(invoice.id, { method: "Cash", reference: "" });

    expect(payment.amount).toBe(750);
    expect((await getInvoice(invoice.id))?.paidAmount).toBe(1_000);
  });

  it("carries the deposit account and fee through", async () => {
    const invoice = await openInvoice();
    const payment = await markInvoicePaidInFull(invoice.id, { method: "Card", reference: "A-1", depositAccountId: "acct-till", feeAmount: 12 });
    expect(payment).toMatchObject({ depositAccountId: "acct-till", feeAmount: 12 });
  });

  it("refuses when nothing is outstanding", async () => {
    const invoice = await openInvoice();
    await markInvoicePaidInFull(invoice.id, { method: "Cash", reference: "" });
    await expect(markInvoicePaidInFull(invoice.id, { method: "Cash", reference: "" })).rejects.toThrow(/nothing outstanding/i);
  });

  it("refuses on a draft, which owes nothing yet", async () => {
    const draft = await createInvoice(payload());
    await expect(markInvoicePaidInFull(draft.id, { method: "Cash", reference: "" })).rejects.toThrow();
  });
});

describe("markPaymentCleared", () => {
  it("stamps the cleared date", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({ invoiceId: invoice.id, method: "Cheque", amount: 100, reference: "CHQ-1", receivedAt: "2026-09-20" });
    expect(payment.clearedAt).toBeUndefined();

    const cleared = await markPaymentCleared(payment.id, "2026-09-25");
    expect(cleared.clearedAt).toBe("2026-09-25");
  });

  it("refuses to clear before the money was received", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({ invoiceId: invoice.id, method: "Cheque", amount: 100, reference: "", receivedAt: "2026-09-20" });
    await expect(markPaymentCleared(payment.id, "2026-09-19")).rejects.toThrow(/before they were received/i);
  });

  it("refuses an unknown payment", async () => {
    await expect(markPaymentCleared("PMT-nope")).rejects.toThrow(/no longer exists/i);
  });

  it("leaves the invoice's paid amount alone — clearing is a banking fact, not a payment one", async () => {
    const invoice = await openInvoice();
    const payment = await recordPayment({ invoiceId: invoice.id, method: "Cheque", amount: 400, reference: "", receivedAt: "2026-09-20" });
    const before = (await getInvoice(invoice.id))?.paidAmount;

    await markPaymentCleared(payment.id, "2026-09-25");
    expect((await getInvoice(invoice.id))?.paidAmount).toBe(before);
  });
});

describe("payment history", () => {
  it("lists every payment against an invoice", async () => {
    const invoice = await openInvoice();
    await recordPayment({ invoiceId: invoice.id, method: "Wire", amount: 300, reference: "" });
    await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 200, reference: "" });
    expect(await listPaymentsForInvoice(invoice.id)).toHaveLength(2);
  });

  it("keeps payments of different invoices apart", async () => {
    const first = await openInvoice();
    const second = await openInvoice(500);
    await recordPayment({ invoiceId: first.id, method: "Cash", amount: 100, reference: "" });

    expect(await listPaymentsForInvoice(second.id)).toHaveLength(0);
  });

  it("gives each payment its own id", async () => {
    const invoice = await openInvoice();
    const a = await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "" });
    const b = await recordPayment({ invoiceId: invoice.id, method: "Cash", amount: 100, reference: "" });
    expect(a.id).not.toBe(b.id);
  });
});
