import { logJobActivity } from "@/lib/api/jobOrderApi";
import { getCurrentFxRate } from "@/lib/currency";
import { findDuplicateInvoice, jobIdsForPurchase } from "@/lib/job/costing";
import * as jobStore from "@/lib/store/jobOrderStore";
import * as store from "@/lib/store/purchaseOrderStore";
import * as vendorStore from "@/lib/store/vendorStore";
import {
  NO_CHARGES,
  type LineDestination,
  type PurchaseCharges,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderLineType,
  type PurchaseOrderStatus,
  type PurchaseTax,
  type PurchaseUnit,
} from "@/types/purchaseOrder";
import type { CostBucket } from "@/types/jobOrder";
import type { InventoryCategory } from "@/types/inventory";

const DEFAULT_ACTOR = "Jordan Miller";

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return [...store.getAll()];
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
  return store.getById(id);
}

export interface CreatePurchaseOrderPayload {
  vendorId: string;
  expectedDate: string;
  notes: string;
  currency: string;
  lines: { description: string; category?: InventoryCategory; expectedQty: number; expectedCost: number }[];
}

export async function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
  const id = store.nextPurchaseOrderId();
  const order: PurchaseOrder = {
    id,
    vendorId: payload.vendorId,
    status: "Sent",
    issuedAt: new Date().toISOString().slice(0, 10),
    expectedDate: payload.expectedDate,
    notes: payload.notes,
    currency: payload.currency,
    fxRateToBase: getCurrentFxRate(payload.currency),
    documentType: "PurchaseOrder",
    charges: { ...NO_CHARGES },
    tax: { amount: 0, recoverable: true },
    entryMethod: "Typed",
    lines: payload.lines.map((line, index) => ({
      ...line,
      id: `${id}-L${index + 1}`,
      lineType: "Goods",
      unit: "pcs",
      receivedQty: 0,
      receivedItemIds: [],
      destination: { kind: "Stock" },
    })),
  };
  return store.insert(order);
}

/** Job lines (and any other non-stock line) count as fulfilled from the start — there is nothing to receive. */
function deriveStatus(lines: PurchaseOrderLine[], previous: PurchaseOrderStatus): PurchaseOrderStatus {
  if (previous === "Draft" || previous === "Cancelled") return previous;
  const totalExpected = lines.reduce((sum, l) => sum + l.expectedQty, 0);
  const totalReceived = lines.reduce((sum, l) => sum + Math.min(l.receivedQty, l.expectedQty), 0);
  if (totalReceived === 0) return "Sent";
  if (totalReceived >= totalExpected) return "Received";
  return "Partially received";
}

/** Called after ReceiveItemDialog creates an item against a PO line — records the link and rolls up the PO's status. */
export async function recordLineReceipt(orderId: string, lineId: string, receivedItemId: string): Promise<PurchaseOrder | undefined> {
  const order = store.getById(orderId);
  if (!order) return undefined;
  const lines = order.lines.map((line) => (line.id === lineId ? { ...line, receivedQty: line.receivedQty + 1, receivedItemIds: [...line.receivedItemIds, receivedItemId] } : line));
  return store.update(orderId, { lines, status: deriveStatus(lines, order.status) });
}

export async function setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder | undefined> {
  return store.update(id, { status });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  store.remove(id);
}

/* ------------------------------------------------------------------ job invoices */

export class PurchaseValidationError extends Error {}

/** Same vendor + same invoice number already entered. Carries the existing document so the screen can link to it. */
export class DuplicateInvoiceError extends PurchaseValidationError {
  constructor(readonly existing: PurchaseOrder) {
    super(`Invoice ${existing.vendorInvoiceNumber} from this vendor is already entered as ${existing.id}.`);
  }
}

export interface JobInvoiceLineInput {
  /** Present when editing an existing line, so its receipt history is kept. */
  id?: string;
  description: string;
  lineType: PurchaseOrderLineType;
  bucket?: CostBucket;
  category?: InventoryCategory;
  unit: PurchaseUnit;
  expectedQty: number;
  expectedCost: number;
  destination: LineDestination;
}

export interface JobInvoicePayload {
  documentType: "VendorInvoice" | "CreditNote";
  vendorId: string;
  vendorInvoiceNumber: string;
  vendorInvoiceDate: string;
  creditForPoId?: string;
  currency: string;
  charges: PurchaseCharges;
  tax: PurchaseTax;
  notes: string;
  lines: JobInvoiceLineInput[];
  entryMethod?: "Typed" | "AIScan";
}

const documentLabel = (payload: Pick<JobInvoicePayload, "documentType">) => (payload.documentType === "CreditNote" ? "Credit note" : "Invoice");

function validateJobInvoice(payload: JobInvoicePayload, existing?: PurchaseOrder) {
  const vendor = vendorStore.getById(payload.vendorId);
  if (!vendor) throw new PurchaseValidationError("Choose the vendor.");
  if (!payload.vendorInvoiceNumber.trim()) throw new PurchaseValidationError(`Enter the vendor's ${documentLabel(payload).toLowerCase()} number.`);
  if (!payload.vendorInvoiceDate) throw new PurchaseValidationError(`Enter the ${documentLabel(payload).toLowerCase()} date.`);
  if (!payload.currency) throw new PurchaseValidationError("Choose the currency.");
  if (payload.lines.length === 0) throw new PurchaseValidationError("Add at least one line.");

  payload.lines.forEach((line, index) => {
    const at = `Line ${index + 1}`;
    if (!line.description.trim()) throw new PurchaseValidationError(`${at}: add a description.`);
    if (!(line.expectedQty > 0)) throw new PurchaseValidationError(`${at}: quantity must be above zero.`);
    if (!(line.expectedCost >= 0)) throw new PurchaseValidationError(`${at}: price can't be negative.`);
    if (line.destination.kind === "Job") {
      const job = jobStore.getById(line.destination.jobId);
      if (!job) throw new PurchaseValidationError(`${at}: job ${line.destination.jobId} doesn't exist.`);
      const before = existing?.lines.find((l) => l.id === line.id);
      const unchangedJob = before?.destination.kind === "Job" && before.destination.jobId === job.id;
      if (job.status === "Cancelled" && !unchangedJob) throw new PurchaseValidationError(`${at}: ${job.id} is cancelled — choose another job.`);
    }
  });

  for (const [key, value] of Object.entries(payload.charges)) {
    if (!(value >= 0)) throw new PurchaseValidationError(`${key[0].toUpperCase()}${key.slice(1)} can't be negative.`);
  }
  if (!(payload.tax.amount >= 0)) throw new PurchaseValidationError("Tax can't be negative.");

  if (payload.documentType === "CreditNote" && payload.creditForPoId) {
    const original = store.getById(payload.creditForPoId);
    if (!original || original.vendorId !== payload.vendorId) throw new PurchaseValidationError("The original invoice must be from the same vendor.");
  }

  const duplicate = findDuplicateInvoice(store.getAll(), payload, existing?.id);
  if (duplicate) throw new DuplicateInvoiceError(duplicate);

  // A stock line that already has items received against it can't be pulled out from under them.
  if (existing) {
    for (const before of existing.lines) {
      if (before.receivedItemIds.length === 0) continue;
      const after = payload.lines.find((l) => l.id === before.id);
      if (!after) throw new PurchaseValidationError(`"${before.description}" has items received against it and can't be removed.`);
      if (after.destination.kind !== "Stock") throw new PurchaseValidationError(`"${before.description}" has items received into stock — it can't be moved to a job.`);
      if (after.expectedQty < before.receivedItemIds.length) throw new PurchaseValidationError(`"${before.description}": ${before.receivedItemIds.length} already received — quantity can't go below that.`);
    }
  }
}

function buildLines(orderId: string, inputs: JobInvoiceLineInput[], existing?: PurchaseOrder): PurchaseOrderLine[] {
  const usedNumbers = new Set((existing?.lines ?? []).map((l) => Number(l.id.split("-L").pop())).filter((n) => !Number.isNaN(n)));
  let nextNumber = usedNumbers.size ? Math.max(...usedNumbers) + 1 : 1;
  return inputs.map((input) => {
    const before = input.id ? existing?.lines.find((l) => l.id === input.id) : undefined;
    const id = before?.id ?? `${orderId}-L${nextNumber++}`;
    const toStock = input.destination.kind === "Stock";
    return {
      id,
      description: input.description.trim(),
      lineType: input.lineType,
      bucket: input.bucket,
      category: input.category,
      unit: input.unit,
      expectedQty: input.expectedQty,
      expectedCost: input.expectedCost,
      // Stock lines are received through the Receive dialog; anything charged to a job was delivered with the invoice.
      receivedQty: toStock ? (before?.receivedItemIds.length ?? 0) : input.expectedQty,
      receivedItemIds: toStock ? (before?.receivedItemIds ?? []) : [],
      destination: input.destination,
    };
  });
}

function describeDocument(order: PurchaseOrder): string {
  const vendor = vendorStore.getById(order.vendorId)?.name ?? order.vendorId;
  return `${order.documentType === "CreditNote" ? "Credit note" : "Invoice"} ${order.vendorInvoiceNumber} from ${vendor} (${order.id})`;
}

/** Enters a vendor invoice or credit note against one or more jobs. It is stored — and listed — as a purchase order. */
export async function createJobInvoice(payload: JobInvoicePayload, actor = DEFAULT_ACTOR): Promise<PurchaseOrder> {
  validateJobInvoice(payload);
  const id = store.nextPurchaseOrderId();
  const lines = buildLines(id, payload.lines);
  const order: PurchaseOrder = {
    id,
    vendorId: payload.vendorId,
    lines,
    status: deriveStatus(lines, "Sent"),
    issuedAt: new Date().toISOString().slice(0, 10),
    expectedDate: payload.vendorInvoiceDate,
    notes: payload.notes.trim(),
    currency: payload.currency,
    fxRateToBase: getCurrentFxRate(payload.currency),
    documentType: payload.documentType,
    vendorInvoiceNumber: payload.vendorInvoiceNumber.trim(),
    vendorInvoiceDate: payload.vendorInvoiceDate,
    creditForPoId: payload.documentType === "CreditNote" ? payload.creditForPoId || undefined : undefined,
    charges: { ...payload.charges },
    tax: { ...payload.tax },
    entryMethod: payload.entryMethod ?? "Typed",
  };
  store.insert(order);
  for (const jobId of jobIdsForPurchase(order)) logJobActivity(jobId, `${describeDocument(order)} added.`, actor);
  return order;
}

export async function updateJobInvoice(id: string, payload: JobInvoicePayload, actor = DEFAULT_ACTOR): Promise<PurchaseOrder | undefined> {
  const existing = store.getById(id);
  if (!existing) throw new PurchaseValidationError(`${id} no longer exists.`);
  validateJobInvoice(payload, existing);
  const lines = buildLines(id, payload.lines, existing);
  const updated = store.update(id, {
    vendorId: payload.vendorId,
    lines,
    status: deriveStatus(lines, existing.status === "Cancelled" ? "Cancelled" : "Sent"),
    expectedDate: payload.vendorInvoiceDate,
    notes: payload.notes.trim(),
    currency: payload.currency,
    // The rate captured on entry stays unless the currency itself was corrected.
    fxRateToBase: payload.currency === existing.currency ? existing.fxRateToBase : getCurrentFxRate(payload.currency),
    documentType: payload.documentType,
    vendorInvoiceNumber: payload.vendorInvoiceNumber.trim(),
    vendorInvoiceDate: payload.vendorInvoiceDate,
    creditForPoId: payload.documentType === "CreditNote" ? payload.creditForPoId || undefined : undefined,
    charges: { ...payload.charges },
    tax: { ...payload.tax },
  });
  if (updated) {
    const touched = new Set([...jobIdsForPurchase(existing), ...jobIdsForPurchase(updated)]);
    for (const jobId of touched) logJobActivity(jobId, `${describeDocument(updated)} edited.`, actor);
  }
  return updated;
}

export async function deleteJobInvoice(id: string, actor = DEFAULT_ACTOR): Promise<void> {
  const existing = store.getById(id);
  if (!existing) return;
  if (existing.lines.some((l) => l.receivedItemIds.length > 0)) throw new PurchaseValidationError("Items have been received into stock against this document — it can't be deleted.");
  store.remove(id);
  for (const jobId of jobIdsForPurchase(existing)) logJobActivity(jobId, `${describeDocument(existing)} deleted.`, actor);
}
