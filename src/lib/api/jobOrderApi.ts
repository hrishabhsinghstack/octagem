import * as purchaseOrderStore from "@/lib/store/purchaseOrderStore";
import * as store from "@/lib/store/jobOrderStore";
import { jobIdsForPurchase } from "@/lib/job/costing";
import { materialsHeld } from "@/lib/job/materials";
import type { CostBucket, JobActivity, JobCostEntry, JobOrder, JobStatus, JobType } from "@/types/jobOrder";

const DEFAULT_ACTOR = "Jordan Miller";

const today = () => new Date().toISOString().slice(0, 10);
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export class JobOrderError extends Error {}

function activity(note: string, actor: string): JobActivity {
  return { id: newId("JA"), occurredAt: new Date().toISOString(), actor, note };
}

function requireJob(id: string): JobOrder {
  const job = store.getById(id);
  if (!job) throw new JobOrderError(`Job order ${id} no longer exists.`);
  return job;
}

/** Appends to a job's activity log. Exported for purchaseOrderApi, which records invoice events on every job an invoice touches. */
export function logJobActivity(jobId: string, note: string, actor = DEFAULT_ACTOR) {
  const job = store.getById(jobId);
  if (job) store.update(jobId, { activity: [activity(note, actor), ...job.activity] });
}

export async function listJobOrders(): Promise<JobOrder[]> {
  return [...store.getAll()];
}

export async function getJobOrder(id: string): Promise<JobOrder | undefined> {
  return store.getById(id);
}

export interface JobOrderPayload {
  type: JobType;
  title: string;
  customerId?: string;
  targetDate?: string;
  notes: string;
  overheadPct: number;
}

function validateHeader(payload: JobOrderPayload) {
  if (!payload.title.trim()) throw new JobOrderError("Give the job a title.");
  if (payload.type === "CustomerOrder" && !payload.customerId) throw new JobOrderError("A customer order needs a customer.");
  if (!(payload.overheadPct >= 0 && payload.overheadPct <= 100)) throw new JobOrderError("Overhead must be between 0% and 100%.");
}

export async function createJobOrder(payload: JobOrderPayload, actor = DEFAULT_ACTOR): Promise<JobOrder> {
  validateHeader(payload);
  const job: JobOrder = {
    id: store.nextJobOrderId(),
    type: payload.type,
    title: payload.title.trim(),
    customerId: payload.customerId || undefined,
    status: "Open",
    openedAt: today(),
    targetDate: payload.targetDate || undefined,
    notes: payload.notes.trim(),
    estimate: {},
    overheadPct: payload.overheadPct,
    costEntries: [],
    customerMaterials: [],
    activity: [activity("Job order opened.", actor)],
  };
  return store.insert(job);
}

export async function updateJobOrder(id: string, payload: JobOrderPayload, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  validateHeader(payload);
  const job = requireJob(id);
  return store.update(id, {
    type: payload.type,
    title: payload.title.trim(),
    customerId: payload.customerId || undefined,
    targetDate: payload.targetDate || undefined,
    notes: payload.notes.trim(),
    overheadPct: payload.overheadPct,
    activity: [activity("Job details updated.", actor), ...job.activity],
  });
}

export async function setJobStatus(id: string, status: JobStatus, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireJob(id);
  if (job.status === status) return job;
  if (status === "Cancelled") {
    const held = materialsHeld(job);
    if (held.length > 0) throw new JobOrderError(`Return the stock this job still holds first (${held.map((e) => e.inventoryItemId).join(", ")}), or mark it lost.`);
    if (job.customerMaterials.some((m) => m.status === "Held")) throw new JobOrderError("The customer's material is still held — mark it returned before cancelling.");
  }
  return store.update(id, { status, activity: [activity(`Status changed from ${job.status} to ${status}.`, actor), ...job.activity] });
}

export async function setJobEstimate(id: string, estimate: JobOrder["estimate"], actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireJob(id);
  const cleaned: JobOrder["estimate"] = {};
  for (const [bucket, value] of Object.entries(estimate) as [CostBucket, number | undefined][]) {
    if (value === undefined || Number.isNaN(value)) continue;
    if (value < 0) throw new JobOrderError("Estimates can't be negative.");
    if (value > 0) cleaned[bucket] = value;
  }
  return store.update(id, { estimate: cleaned, activity: [activity("Estimate updated.", actor), ...job.activity] });
}

export interface InternalCostPayload {
  occurredAt: string;
  bucket: CostBucket;
  description: string;
  /** Either an amount, or hours × rate. */
  amountBase?: number;
  hours?: number;
  ratePerHour?: number;
}

/** A cost with no vendor invoice behind it — in-house wages, a cash hallmarking fee. Base currency. */
export async function addInternalCost(jobId: string, payload: InternalCostPayload, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireJob(jobId);
  if (job.status === "Cancelled") throw new JobOrderError("This job is cancelled — no new costs can be added.");
  if (!payload.description.trim()) throw new JobOrderError("Describe the cost.");
  const byHours = payload.hours !== undefined && payload.ratePerHour !== undefined;
  const amount = byHours ? payload.hours! * payload.ratePerHour! : payload.amountBase;
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) throw new JobOrderError(byHours ? "Hours and rate must both be above zero." : "Enter an amount above zero.");
  const entry: JobCostEntry = {
    id: newId("JC"),
    occurredAt: payload.occurredAt || today(),
    source: "Internal",
    bucket: payload.bucket,
    description: payload.description.trim(),
    amountBase: Math.round(amount * 100) / 100,
    hours: byHours ? payload.hours : undefined,
    ratePerHour: byHours ? payload.ratePerHour : undefined,
    actor,
  };
  return store.update(jobId, {
    costEntries: [...job.costEntries, entry],
    activity: [activity(`Internal cost added: ${entry.description}.`, actor), ...job.activity],
  });
}

export async function removeCostEntry(jobId: string, entryId: string, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireJob(jobId);
  const entry = job.costEntries.find((e) => e.id === entryId);
  if (!entry) return job;
  if (entry.source !== "Internal") throw new JobOrderError("Only internal costs can be removed here.");
  return store.update(jobId, {
    costEntries: job.costEntries.filter((e) => e.id !== entryId),
    activity: [activity(`Internal cost removed: ${entry.description}.`, actor), ...job.activity],
  });
}

/** Only an empty job can be deleted — once an invoice or cost points at it, cancel it instead so the history stays. */
export async function deleteJobOrder(id: string): Promise<void> {
  const job = requireJob(id);
  const referenced = purchaseOrderStore.getAll().some((order) => jobIdsForPurchase(order).includes(id));
  if (referenced || job.costEntries.length > 0) throw new JobOrderError("This job has invoices or costs on it. Cancel it instead of deleting.");
  store.remove(id);
}
