import { hasCleared, localToday, netReceived, remainingBalance, statusAfterPayment, totalFees, unclearedTotal, validatePayment, type PaymentDraft } from "@/lib/payment";
import type { InvoiceStatus } from "@/types/invoice";
import { describe, expect, it } from "vitest";

const invoice = (total: number, paidAmount = 0) => ({ total, paidAmount });

const draft = (over: Partial<PaymentDraft> = {}): PaymentDraft => ({ amount: 100, receivedAt: "2026-09-20", ...over });

const TODAY = "2026-09-29";

describe("remainingBalance", () => {
  it("is total minus paid", () => {
    expect(remainingBalance(invoice(1_000, 250))).toBe(750);
  });

  it("is zero on a settled invoice", () => {
    expect(remainingBalance(invoice(1_000, 1_000))).toBe(0);
  });

  it("rounds to cents rather than carrying float error", () => {
    expect(remainingBalance(invoice(0.3, 0.1))).toBe(0.2);
  });
});

describe("validatePayment", () => {
  it("accepts a payment for part of the balance", () => {
    expect(validatePayment(draft({ amount: 400 }), invoice(1_000), TODAY)).toEqual([]);
  });

  it("accepts a payment for exactly the balance", () => {
    expect(validatePayment(draft({ amount: 600 }), invoice(1_000, 400), TODAY)).toEqual([]);
  });

  it("refuses an overpayment rather than silently capping it", () => {
    const problems = validatePayment(draft({ amount: 1_200 }), invoice(1_000), TODAY);
    expect(problems.map((p) => p.field)).toEqual(["amount"]);
    expect(problems[0].message).toMatch(/more than/i);
  });

  it("refuses zero and negative amounts", () => {
    expect(validatePayment(draft({ amount: 0 }), invoice(1_000), TODAY)).toHaveLength(1);
    expect(validatePayment(draft({ amount: -50 }), invoice(1_000), TODAY)).toHaveLength(1);
  });

  it("refuses any payment once the invoice is settled", () => {
    expect(validatePayment(draft({ amount: 1 }), invoice(1_000, 1_000), TODAY)).toHaveLength(1);
  });

  it("requires a received date", () => {
    expect(validatePayment(draft({ receivedAt: "" }), invoice(1_000), TODAY).map((p) => p.field)).toContain("receivedAt");
  });

  it("refuses a future received date — that would book money not yet in hand", () => {
    expect(validatePayment(draft({ receivedAt: "2026-12-01" }), invoice(1_000), TODAY).map((p) => p.field)).toContain("receivedAt");
  });

  it("accepts a received date of today", () => {
    expect(validatePayment(draft({ receivedAt: TODAY }), invoice(1_000), TODAY)).toEqual([]);
  });

  it("refuses funds clearing before they were received", () => {
    const problems = validatePayment(draft({ receivedAt: "2026-09-20", clearedAt: "2026-09-19" }), invoice(1_000), TODAY);
    expect(problems.map((p) => p.field)).toContain("clearedAt");
  });

  it("accepts funds clearing on the same day", () => {
    expect(validatePayment(draft({ receivedAt: "2026-09-20", clearedAt: "2026-09-20" }), invoice(1_000), TODAY)).toEqual([]);
  });

  it("accepts a cleared date left blank — the money is simply still in transit", () => {
    expect(validatePayment(draft({ clearedAt: undefined }), invoice(1_000), TODAY)).toEqual([]);
  });

  it("refuses a negative fee", () => {
    expect(validatePayment(draft({ feeAmount: -1 }), invoice(1_000), TODAY).map((p) => p.field)).toContain("feeAmount");
  });

  it("refuses a fee larger than the payment", () => {
    expect(validatePayment(draft({ amount: 100, feeAmount: 150 }), invoice(1_000), TODAY).map((p) => p.field)).toContain("feeAmount");
  });

  it("accepts a zero fee", () => {
    expect(validatePayment(draft({ feeAmount: 0 }), invoice(1_000), TODAY)).toEqual([]);
  });

  it("reports every problem at once rather than one at a time", () => {
    const problems = validatePayment(draft({ amount: 5_000, receivedAt: "2099-01-01", feeAmount: -5 }), invoice(1_000), TODAY);
    expect(problems.map((p) => p.field).sort()).toEqual(["amount", "feeAmount", "receivedAt"]);
  });
});

describe("statusAfterPayment", () => {
  it("moves an open invoice to partially paid", () => {
    expect(statusAfterPayment("Open", 1_000, 400)).toBe("Partially paid");
  });

  it("settles an invoice paid in full", () => {
    expect(statusAfterPayment("Open", 1_000, 1_000)).toBe("Paid");
  });

  it("settles when rounding would otherwise leave a fraction short", () => {
    expect(statusAfterPayment("Open", 0.3, 0.1 + 0.2)).toBe("Paid");
  });

  it("returns to Open when payments are wound back to nothing", () => {
    expect(statusAfterPayment("Partially paid", 1_000, 0)).toBe("Open");
  });

  it("never drags a draft into the payment story", () => {
    expect(statusAfterPayment("Draft", 1_000, 500)).toBe("Draft");
  });

  it("never revives a void invoice", () => {
    expect(statusAfterPayment("Void", 1_000, 1_000)).toBe("Void");
  });

  it("leaves every issued status resolvable", () => {
    const issued: InvoiceStatus[] = ["Open", "Partially paid", "Paid"];
    for (const status of issued) expect(["Open", "Partially paid", "Paid"]).toContain(statusAfterPayment(status, 100, 50));
  });
});

describe("fees and clearing", () => {
  it("nets the fee off what reached the bank", () => {
    expect(netReceived({ amount: 1_000, feeAmount: 29.5 })).toBe(970.5);
  });

  it("treats a missing fee as zero", () => {
    expect(netReceived({ amount: 1_000 })).toBe(1_000);
  });

  it("knows whether a payment has cleared", () => {
    expect(hasCleared({ clearedAt: "2026-09-21" })).toBe(true);
    expect(hasCleared({ clearedAt: undefined })).toBe(false);
  });

  it("sums only what has not cleared", () => {
    expect(unclearedTotal([{ amount: 100, clearedAt: "2026-09-21" }, { amount: 250 }, { amount: 50 }])).toBe(300);
  });

  it("is zero when everything has cleared", () => {
    expect(unclearedTotal([{ amount: 100, clearedAt: "2026-09-21" }])).toBe(0);
  });

  it("sums fees across payments", () => {
    expect(totalFees([{ feeAmount: 10.25 }, { feeAmount: 4.75 }, {}])).toBe(15);
  });
});

describe("localToday", () => {
  it("uses the local calendar date, not the UTC one", () => {
    // 00:30 local on 29 Sep. Built from local parts, so it is the 29th in every timezone — whereas
    // toISOString() would say the 28th anywhere east of UTC.
    expect(localToday(new Date(2026, 8, 29, 0, 30))).toBe("2026-09-29");
  });

  it("zero-pads month and day", () => {
    expect(localToday(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});
