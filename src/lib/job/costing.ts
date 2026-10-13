import { convertToBase } from "@/lib/currency";
import type { CostBucket, JobCostEntrySource, JobOrder } from "@/types/jobOrder";
import type { PurchaseCharges, PurchaseDocumentType, PurchaseOrder, PurchaseOrderLine } from "@/types/purchaseOrder";

/**
 * Job costing, read side. The job cost ledger is never stored: it is built from the purchase-order lines
 * charged to the job plus the job's own cost entries, so it can't drift from the invoices it comes from.
 * Everything here is pure — the job screen, the job list and the tests all call the same functions.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

export function lineValue(line: Pick<PurchaseOrderLine, "expectedQty" | "expectedCost">): number {
  return line.expectedQty * line.expectedCost;
}

export function linesSubtotal(order: Pick<PurchaseOrder, "lines">): number {
  return order.lines.reduce((sum, line) => sum + lineValue(line), 0);
}

/** Shipping + insurance + duty + other − discount. */
export function chargesTotal(charges: PurchaseCharges): number {
  return charges.shipping + charges.insurance + charges.duty + charges.other - charges.discount;
}

/** What the paper document says is owed, in its own currency — tax included whether or not it is recoverable. */
export function documentTotal(order: Pick<PurchaseOrder, "lines" | "charges" | "tax">): number {
  return linesSubtotal(order) + chargesTotal(order.charges) + order.tax.amount;
}

/** Credit notes are stored with positive quantities and prices, like the paper; the sign is applied when costing. */
export function documentSign(documentType: PurchaseDocumentType): 1 | -1 {
  return documentType === "CreditNote" ? -1 : 1;
}

export function isJobDocument(order: Pick<PurchaseOrder, "documentType">): boolean {
  return order.documentType !== "PurchaseOrder";
}

/** Every job at least one line of this document is charged to, in line order. */
export function jobIdsForPurchase(order: Pick<PurchaseOrder, "lines">): string[] {
  const ids: string[] = [];
  for (const line of order.lines) {
    if (line.destination.kind === "Job" && !ids.includes(line.destination.jobId)) ids.push(line.destination.jobId);
  }
  return ids;
}

/**
 * A line's landed cost in the document's currency, unsigned: its own value plus its share of the header
 * charges — and of the tax, when the tax can't be reclaimed — in proportion to its value. Spreading by
 * value is what puts a share of the freight on a job when one invoice covers several jobs and stock.
 */
export function landedLineCost(order: Pick<PurchaseOrder, "lines" | "charges" | "tax">, line: PurchaseOrderLine): number {
  const subtotal = linesSubtotal(order);
  const extras = chargesTotal(order.charges) + (order.tax.recoverable ? 0 : order.tax.amount);
  const share = subtotal !== 0 ? lineValue(line) / subtotal : 1 / Math.max(order.lines.length, 1);
  return lineValue(line) + extras * share;
}

export function bucketForLine(line: Pick<PurchaseOrderLine, "bucket" | "lineType">): CostBucket {
  if (line.bucket) return line.bucket;
  return line.lineType === "Metal" ? "Metal" : "Other";
}

export type JobLedgerSource = PurchaseDocumentType | JobCostEntrySource | "Overhead";

export interface JobLedgerRow {
  id: string;
  occurredAt: string;
  source: JobLedgerSource;
  bucket: CostBucket;
  description: string;
  vendorId?: string;
  purchaseOrderId?: string;
  vendorInvoiceNumber?: string;
  /** Signed, landed, in the document's currency — only on rows that come from a purchase document. */
  amountDocument?: number;
  currency?: string;
  /** Signed, base currency. */
  amountBase: number;
  /** Set on rows that are the job's own entries, so the screen can offer to remove them. */
  costEntryId?: string;
}

/**
 * The job's cost ledger: purchase lines charged to it (cancelled orders excluded), its own cost entries,
 * and the overhead loading on top of both. Oldest first.
 */
export function buildJobLedger(job: Pick<JobOrder, "id" | "costEntries" | "overheadPct">, purchaseOrders: PurchaseOrder[]): JobLedgerRow[] {
  const rows: JobLedgerRow[] = [];

  for (const order of purchaseOrders) {
    if (order.status === "Cancelled") continue;
    const sign = documentSign(order.documentType);
    for (const line of order.lines) {
      if (line.destination.kind !== "Job" || line.destination.jobId !== job.id) continue;
      const amountDocument = round2(sign * landedLineCost(order, line));
      rows.push({
        id: `${order.id}:${line.id}`,
        occurredAt: order.vendorInvoiceDate || order.issuedAt,
        source: order.documentType,
        bucket: bucketForLine(line),
        description: line.description,
        vendorId: order.vendorId,
        purchaseOrderId: order.id,
        vendorInvoiceNumber: order.vendorInvoiceNumber,
        amountDocument,
        currency: order.currency,
        amountBase: round2(convertToBase(amountDocument, order.fxRateToBase)),
      });
    }
  }

  for (const entry of job.costEntries) {
    rows.push({
      id: entry.id,
      occurredAt: entry.occurredAt,
      source: entry.source,
      bucket: entry.bucket,
      description: entry.description,
      amountBase: round2(entry.amountBase),
      costEntryId: entry.id,
    });
  }

  rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  if (job.overheadPct > 0) {
    const base = rows.reduce((sum, row) => sum + row.amountBase, 0);
    rows.push({
      id: `${job.id}:overhead`,
      occurredAt: rows[rows.length - 1]?.occurredAt ?? "",
      source: "Overhead",
      bucket: "Overhead",
      description: `Workshop overhead ${job.overheadPct}%`,
      amountBase: round2((base * job.overheadPct) / 100),
    });
  }

  return rows;
}

export interface JobCostSummary {
  total: number;
  byBucket: Partial<Record<CostBucket, number>>;
  estimateTotal: number;
  /** Purchase documents (invoices, credit notes, orders) with at least one line on this job. */
  documentCount: number;
}

export function summarizeJobCost(rows: JobLedgerRow[], estimate: JobOrder["estimate"]): JobCostSummary {
  const byBucket: Partial<Record<CostBucket, number>> = {};
  for (const row of rows) byBucket[row.bucket] = round2((byBucket[row.bucket] ?? 0) + row.amountBase);
  const documents = new Set(rows.filter((row) => row.purchaseOrderId).map((row) => row.purchaseOrderId));
  return {
    total: round2(rows.reduce((sum, row) => sum + row.amountBase, 0)),
    byBucket,
    estimateTotal: round2(Object.values(estimate).reduce((sum, value) => sum + (value ?? 0), 0)),
    documentCount: documents.size,
  };
}

/** Vendor invoice numbers are compared ignoring case, spaces and punctuation: "INV-0042" and "inv 0042" are the same paper. */
export function normalizeInvoiceNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** An already-entered document with the same vendor, type and invoice number — entering it twice would double the job's cost. */
export function findDuplicateInvoice(
  purchaseOrders: PurchaseOrder[],
  candidate: { vendorId: string; vendorInvoiceNumber: string; documentType: PurchaseDocumentType },
  excludeId?: string,
): PurchaseOrder | undefined {
  const number = normalizeInvoiceNumber(candidate.vendorInvoiceNumber);
  if (!number) return undefined;
  return purchaseOrders.find(
    (order) =>
      order.id !== excludeId &&
      order.vendorId === candidate.vendorId &&
      order.documentType === candidate.documentType &&
      normalizeInvoiceNumber(order.vendorInvoiceNumber ?? "") === number,
  );
}
