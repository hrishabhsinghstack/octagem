import {
  canDeleteInvoice,
  canEditInvoice,
  canIssueInvoice,
  canRecordPayment,
  canSendInvoice,
  canVoidInvoice,
  countsAsInvoiced,
  countsTowardsReceivables,
  draftItemConflicts,
  invoiceBalance,
  invoiceTotals,
  isAwaitingSend,
  isIssued,
  isSent,
  lineTotal,
  stockLines,
} from "@/lib/invoice";
import type { InvoiceLine, InvoiceStatus } from "@/types/invoice";
import { describe, expect, it } from "vitest";

const line = (id: string, total: number, itemId?: string): InvoiceLine => ({
  id,
  itemId,
  description: itemId ?? "Service",
  unitPrice: total,
  quantity: 1,
  lineTotal: total,
});

const ALL_STATUSES: InvoiceStatus[] = ["Draft", "Open", "Partially paid", "Paid", "Void"];

describe("lineTotal", () => {
  it("multiplies and rounds to cents", () => {
    expect(lineTotal(3, 19.99)).toBe(59.97);
  });

  it("does not accumulate float error", () => {
    expect(lineTotal(3, 0.1)).toBe(0.3);
  });
});

describe("invoiceTotals", () => {
  it("sums line totals into the subtotal", () => {
    expect(invoiceTotals([line("L1", 1_000), line("L2", 250)]).subtotal).toBe(1_250);
  });

  it("is all zeros for an empty invoice", () => {
    expect(invoiceTotals([])).toEqual({ subtotal: 0, discount: 0, tax: 0, shipping: 0, total: 0 });
  });

  it("taxes the discounted subtotal, not the gross", () => {
    // 1000 − 100 = 900 taxable; 10% = 90.
    const amounts = invoiceTotals([line("L1", 1_000)], { discount: 100, taxPercent: 10 });
    expect(amounts.tax).toBe(90);
    expect(amounts.total).toBe(990);
  });

  it("adds shipping after tax, so shipping is not taxed", () => {
    const amounts = invoiceTotals([line("L1", 1_000)], { taxPercent: 10, shipping: 50 });
    expect(amounts.tax).toBe(100);
    expect(amounts.total).toBe(1_150);
  });

  it("caps a discount at the subtotal rather than going negative", () => {
    const amounts = invoiceTotals([line("L1", 500)], { discount: 900, taxPercent: 10 });
    expect(amounts.discount).toBe(500);
    expect(amounts.tax).toBe(0);
    expect(amounts.total).toBe(0);
  });

  it("ignores negative discount and shipping", () => {
    const amounts = invoiceTotals([line("L1", 100)], { discount: -50, shipping: -20 });
    expect(amounts).toMatchObject({ discount: 0, shipping: 0, total: 100 });
  });

  it("rounds a fractional tax to cents", () => {
    // 8.875% of 1,234.56 = 109.567... → 109.57
    expect(invoiceTotals([line("L1", 1_234.56)], { taxPercent: 8.875 }).tax).toBe(109.57);
  });

  it("treats a missing tax rate as no tax", () => {
    expect(invoiceTotals([line("L1", 1_000)]).tax).toBe(0);
  });

  it("counts free-text lines exactly like stock lines", () => {
    expect(invoiceTotals([line("L1", 100, "D-1"), line("L2", 400)]).subtotal).toBe(500);
  });
});

describe("invoiceBalance", () => {
  it("is total minus paid", () => {
    expect(invoiceBalance({ total: 1_000, paidAmount: 250 })).toBe(750);
  });

  it("is zero on a settled invoice", () => {
    expect(invoiceBalance({ total: 1_000, paidAmount: 1_000 })).toBe(0);
  });
});

describe("state rules", () => {
  it("treats only Open, Partially paid and Paid as issued", () => {
    const issued = ALL_STATUSES.filter(isIssued);
    expect(issued).toEqual(["Open", "Partially paid", "Paid"]);
  });

  it("allows editing and deleting a draft only", () => {
    for (const status of ALL_STATUSES) {
      expect(canEditInvoice({ status })).toBe(status === "Draft");
      expect(canDeleteInvoice({ status })).toBe(status === "Draft");
    }
  });

  it("will not issue an empty draft", () => {
    expect(canIssueInvoice({ status: "Draft", lines: [] })).toBe(false);
    expect(canIssueInvoice({ status: "Draft", lines: [line("L1", 100)] })).toBe(true);
  });

  it("will not issue something already issued", () => {
    expect(canIssueInvoice({ status: "Open", lines: [line("L1", 100)] })).toBe(false);
  });

  it("refuses to send a draft, and refuses to send a void", () => {
    expect(canSendInvoice({ status: "Draft" })).toBe(false);
    expect(canSendInvoice({ status: "Void" })).toBe(false);
    expect(canSendInvoice({ status: "Open" })).toBe(true);
    // A paid invoice can still be resent — customers ask for receipts.
    expect(canSendInvoice({ status: "Paid" })).toBe(true);
  });

  it("takes payment only on an issued, unsettled invoice", () => {
    expect(canRecordPayment({ status: "Draft" })).toBe(false);
    expect(canRecordPayment({ status: "Open" })).toBe(true);
    expect(canRecordPayment({ status: "Partially paid" })).toBe(true);
    expect(canRecordPayment({ status: "Paid" })).toBe(false);
    expect(canRecordPayment({ status: "Void" })).toBe(false);
  });

  it("voids only what was issued — a draft is deleted instead", () => {
    expect(canVoidInvoice({ status: "Draft" })).toBe(false);
    expect(canVoidInvoice({ status: "Void" })).toBe(false);
    expect(canVoidInvoice({ status: "Open" })).toBe(true);
    expect(canVoidInvoice({ status: "Paid" })).toBe(true);
  });
});

describe("sent flag", () => {
  it("is independent of status — a sent invoice stays sent once paid", () => {
    const sent = { status: "Partially paid" as InvoiceStatus, sentAt: "2026-09-20T10:00:00.000Z" };
    expect(isSent(sent)).toBe(true);
    expect(isAwaitingSend(sent)).toBe(false);
  });

  it("flags an issued invoice that was never sent", () => {
    expect(isAwaitingSend({ status: "Open", sentAt: undefined })).toBe(true);
  });

  it("does not chase a draft for sending", () => {
    expect(isAwaitingSend({ status: "Draft", sentAt: undefined })).toBe(false);
  });

  it("does not chase a void for sending", () => {
    expect(isAwaitingSend({ status: "Void", sentAt: undefined })).toBe(false);
  });

  it("does not chase a paid counter sale that was never emailed", () => {
    // Otherwise the work list carries an item that can never be cleared.
    expect(isAwaitingSend({ status: "Paid", sentAt: undefined })).toBe(false);
  });

  it("still chases a partially paid invoice that was never sent", () => {
    expect(isAwaitingSend({ status: "Partially paid", sentAt: undefined })).toBe(true);
  });

  it("can be cleared by sending", () => {
    expect(isAwaitingSend({ status: "Open", sentAt: "2026-09-20T10:00:00.000Z" })).toBe(false);
  });
});

describe("receivables membership", () => {
  it("excludes drafts — nothing was sold, so nothing is owed", () => {
    expect(countsTowardsReceivables({ status: "Draft" })).toBe(false);
  });

  it("excludes void and paid, includes open and partially paid", () => {
    expect(ALL_STATUSES.filter((status) => countsTowardsReceivables({ status }))).toEqual(["Open", "Partially paid"]);
  });

  it("counts every issued invoice as invoiced, including paid ones", () => {
    expect(ALL_STATUSES.filter((status) => countsAsInvoiced({ status }))).toEqual(["Open", "Partially paid", "Paid"]);
  });
});

describe("draftItemConflicts", () => {
  const draft = { id: "INV-1", lines: [line("L1", 100, "D-1077"), line("L2", 200, "D-1103")] };

  it("finds a stone claimed by another draft", () => {
    const other = { id: "INV-2", status: "Draft" as InvoiceStatus, lines: [line("X1", 100, "D-1077")] };
    expect(draftItemConflicts(draft, [other])).toEqual([{ itemId: "D-1077", invoiceId: "INV-2" }]);
  });

  it("ignores issued invoices — those already took the stock", () => {
    const issued = { id: "INV-2", status: "Open" as InvoiceStatus, lines: [line("X1", 100, "D-1077")] };
    expect(draftItemConflicts(draft, [issued])).toEqual([]);
  });

  it("never reports the draft against itself", () => {
    const self = { id: "INV-1", status: "Draft" as InvoiceStatus, lines: draft.lines };
    expect(draftItemConflicts(draft, [self])).toEqual([]);
  });

  it("is empty for a draft of only free-text lines", () => {
    const freeOnly = { id: "INV-9", lines: [line("L1", 100)] };
    const other = { id: "INV-2", status: "Draft" as InvoiceStatus, lines: [line("X1", 100)] };
    expect(draftItemConflicts(freeOnly, other ? [other] : [])).toEqual([]);
  });

  it("reports each overlapping stone separately", () => {
    const other = { id: "INV-2", status: "Draft" as InvoiceStatus, lines: [line("X1", 1, "D-1077"), line("X2", 2, "D-1103")] };
    expect(draftItemConflicts(draft, [other])).toHaveLength(2);
  });
});

describe("stockLines", () => {
  it("keeps inventory-backed lines and drops free-text ones", () => {
    const lines = [line("L1", 100, "D-1"), line("L2", 200), line("L3", 300, "J-2")];
    expect(stockLines(lines).map((l) => l.itemId)).toEqual(["D-1", "J-2"]);
  });

  it("is empty when nothing is inventory-backed", () => {
    expect(stockLines([line("L1", 100)])).toEqual([]);
  });
});
