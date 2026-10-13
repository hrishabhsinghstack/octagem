import { buildJobLedger, documentTotal, findDuplicateInvoice, jobIdsForPurchase, landedLineCost, normalizeInvoiceNumber, summarizeJobCost } from "@/lib/job/costing";
import type { JobOrder } from "@/types/jobOrder";
import { NO_CHARGES, type PurchaseOrder, type PurchaseOrderLine } from "@/types/purchaseOrder";
import { describe, expect, it } from "vitest";

const jobLine = (id: string, jobId: string, qty: number, price: number, extra: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine => ({
  id,
  description: id,
  lineType: "Service",
  bucket: "Casting",
  unit: "pcs",
  expectedQty: qty,
  expectedCost: price,
  receivedQty: qty,
  receivedItemIds: [],
  destination: { kind: "Job", jobId },
  ...extra,
});

const stockLine = (id: string, qty: number, price: number): PurchaseOrderLine => ({
  id,
  description: id,
  lineType: "Goods",
  unit: "pcs",
  expectedQty: qty,
  expectedCost: price,
  receivedQty: 0,
  receivedItemIds: [],
  destination: { kind: "Stock" },
});

const invoice = (lines: PurchaseOrderLine[], extra: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: "PO-1",
  vendorId: "V-1",
  lines,
  status: "Received",
  issuedAt: "2026-10-01",
  expectedDate: "2026-10-01",
  notes: "",
  currency: "USD",
  fxRateToBase: 1,
  documentType: "VendorInvoice",
  vendorInvoiceNumber: "INV-1",
  vendorInvoiceDate: "2026-10-01",
  charges: NO_CHARGES,
  tax: { amount: 0, recoverable: true },
  entryMethod: "Typed",
  ...extra,
});

const job = (extra: Partial<JobOrder> = {}): Pick<JobOrder, "id" | "costEntries" | "overheadPct"> => ({ id: "JO-0001", costEntries: [], overheadPct: 0, ...extra });

describe("landedLineCost", () => {
  it("spreads header charges over the lines by value", () => {
    const order = invoice([jobLine("a", "JO-0001", 1, 300), stockLine("b", 1, 100)], { charges: { ...NO_CHARGES, shipping: 40, discount: 0 } });
    expect(landedLineCost(order, order.lines[0])).toBe(330);
    expect(landedLineCost(order, order.lines[1])).toBe(110);
  });

  it("adds tax only when it can't be reclaimed", () => {
    const lines = [jobLine("a", "JO-0001", 1, 1000)];
    expect(landedLineCost(invoice(lines, { tax: { amount: 30, recoverable: true } }), lines[0])).toBe(1000);
    expect(landedLineCost(invoice(lines, { tax: { amount: 30, recoverable: false } }), lines[0])).toBe(1030);
  });

  it("takes the discount off", () => {
    const order = invoice([jobLine("a", "JO-0001", 2, 50)], { charges: { ...NO_CHARGES, discount: 10 } });
    expect(landedLineCost(order, order.lines[0])).toBe(90);
  });
});

describe("buildJobLedger", () => {
  it("takes only this job's lines from an invoice that covers several jobs", () => {
    const order = invoice([jobLine("a", "JO-0001", 5, 40), jobLine("b", "JO-0002", 3, 40), stockLine("c", 1, 100)]);
    const rows = buildJobLedger(job(), [order]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purchaseOrderId: "PO-1", amountBase: 200, bucket: "Casting", source: "VendorInvoice" });
    expect(jobIdsForPurchase(order)).toEqual(["JO-0001", "JO-0002"]);
  });

  it("converts to base currency with the rate captured on the invoice", () => {
    const order = invoice([jobLine("a", "JO-0001", 1, 8320)], { currency: "INR", fxRateToBase: 83.2 });
    expect(buildJobLedger(job(), [order])[0]).toMatchObject({ amountDocument: 8320, currency: "INR", amountBase: 100 });
  });

  it("makes credit notes negative", () => {
    const credit = invoice([jobLine("a", "JO-0001", 1, 75)], { id: "PO-2", documentType: "CreditNote" });
    expect(buildJobLedger(job(), [credit])[0].amountBase).toBe(-75);
  });

  it("ignores cancelled documents", () => {
    expect(buildJobLedger(job(), [invoice([jobLine("a", "JO-0001", 1, 75)], { status: "Cancelled" })])).toHaveLength(0);
  });

  it("includes the job's own entries and loads overhead on the total", () => {
    const rows = buildJobLedger(
      job({
        overheadPct: 10,
        costEntries: [{ id: "JC-1", occurredAt: "2026-10-05", source: "Internal", bucket: "Setting", description: "Setter", amountBase: 100, actor: "x" }],
      }),
      [invoice([jobLine("a", "JO-0001", 1, 900)])],
    );
    expect(rows.map((r) => r.source)).toEqual(["VendorInvoice", "Internal", "Overhead"]);
    expect(rows[2].amountBase).toBe(100);
    expect(summarizeJobCost(rows, {}).total).toBe(1100);
  });
});

describe("summarizeJobCost", () => {
  it("totals by bucket and counts documents", () => {
    const order = invoice([jobLine("a", "JO-0001", 1, 100, { bucket: "Metal" }), jobLine("b", "JO-0001", 1, 50)]);
    const summary = summarizeJobCost(buildJobLedger(job(), [order]), { Metal: 120, Casting: 40 });
    expect(summary).toEqual({ total: 150, byBucket: { Metal: 100, Casting: 50 }, estimateTotal: 160, documentCount: 1 });
  });
});

describe("documentTotal", () => {
  it("matches the paper: lines + charges + tax, recoverable or not", () => {
    expect(documentTotal(invoice([jobLine("a", "JO-0001", 2, 100)], { charges: { ...NO_CHARGES, shipping: 20, discount: 5 }, tax: { amount: 6, recoverable: true } }))).toBe(221);
  });
});

describe("findDuplicateInvoice", () => {
  it("matches the same vendor's number ignoring case, spaces and punctuation", () => {
    const existing = invoice([], { vendorInvoiceNumber: "INV-0042" });
    expect(normalizeInvoiceNumber(" inv 0042 ")).toBe("INV0042");
    expect(findDuplicateInvoice([existing], { vendorId: "V-1", vendorInvoiceNumber: "inv 0042", documentType: "VendorInvoice" })?.id).toBe("PO-1");
    expect(findDuplicateInvoice([existing], { vendorId: "V-2", vendorInvoiceNumber: "INV-0042", documentType: "VendorInvoice" })).toBeUndefined();
    expect(findDuplicateInvoice([existing], { vendorId: "V-1", vendorInvoiceNumber: "INV-0042", documentType: "CreditNote" })).toBeUndefined();
    expect(findDuplicateInvoice([existing], { vendorId: "V-1", vendorInvoiceNumber: "INV-0042", documentType: "VendorInvoice" }, "PO-1")).toBeUndefined();
  });
});
