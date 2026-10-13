import { buildJobLedger, summarizeJobCost } from "@/lib/job/costing";
import { MaterialError, outstandingFor, parcelCarats, planConsumption, planReturn, round3, type TakeQuantity } from "@/lib/job/materials";
import { nextStockNumber } from "@/lib/inventory/stockNumber";
import * as catalogStore from "@/lib/store/catalogStore";
import * as inventoryStore from "@/lib/store/inventoryStore";
import * as store from "@/lib/store/jobOrderStore";
import * as purchaseOrderStore from "@/lib/store/purchaseOrderStore";
import type { InventoryItem, LedgerEntry } from "@/types/inventory";
import type { CostBucket, CustomerMaterial, CustomerMaterialStatus, JobActivity, JobCostEntry, JobOrder } from "@/types/jobOrder";

/**
 * Moving physical material between stock and a job order. Every move writes both sides — the inventory
 * item's ledger and the job's cost entries — so "where did this stone go" and "what did this job use"
 * always agree.
 */

export { MaterialError };

const DEFAULT_ACTOR = "Jordan Miller";
const today = () => new Date().toISOString().slice(0, 10);
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const activity = (note: string, actor: string): JobActivity => ({ id: newId("JA"), occurredAt: new Date().toISOString(), actor, note });
const itemLedger = (note: string, actor: string, type: LedgerEntry["type"] = "PRODUCTION_CONSUMPTION"): Omit<LedgerEntry, "id"> => ({ occurredAt: today(), type, note, actor });

function describeQuantity(q?: TakeQuantity): string {
  if (!q) return "";
  return [q.carats ? `${q.carats} ct` : "", q.pieces ? `${q.pieces} pcs` : ""].filter(Boolean).join(" / ");
}

function requireOpenJob(jobId: string): JobOrder {
  const job = store.getById(jobId);
  if (!job) throw new MaterialError(`Job order ${jobId} no longer exists.`);
  if (job.status === "Cancelled") throw new MaterialError(`${jobId} is cancelled.`);
  return job;
}

function requireConsumption(job: JobOrder, entryId: string): JobCostEntry {
  const entry = job.costEntries.find((e) => e.id === entryId && e.source === "StockConsumption");
  if (!entry) throw new MaterialError("That material is no longer on this job.");
  return entry;
}

/* ------------------------------------------------------------------ stock → job */

export interface ConsumePayload extends TakeQuantity {
  itemId: string;
  bucket: CostBucket;
}

/** Takes a whole stone, or part of a parcel, out of stock and charges its cost to the job. */
export async function consumeFromStock(jobId: string, payload: ConsumePayload, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireOpenJob(jobId);
  const item = inventoryStore.getById(payload.itemId);
  if (!item) throw new MaterialError(`${payload.itemId} is not in inventory.`);
  if (item.status !== "Available") throw new MaterialError(`${item.code} is ${item.status} — only available stock can be used.`);
  if (item.ownership !== "OWNED") throw new MaterialError(`${item.code} is on consignment from a vendor — buy it before using it in production.`);

  const plan = planConsumption(item, payload);
  const quantity = item.identityModel === "UNIQUE" ? undefined : { pieces: payload.pieces || undefined, carats: payload.carats || undefined };
  const label = describeQuantity(quantity);

  // A whole stone keeps its own cost (it is out of available stock, so nothing double counts); a parcel's
  // cost moves with the share taken, so what stays in stock is valued at what is left.
  const patch: Partial<InventoryItem> =
    item.identityModel === "UNIQUE"
      ? { status: "Consumed", jobId }
      : plan.emptiesItem
        ? { status: "Consumed", jobId, cost: 0, quantity: item.quantity !== undefined ? 0 : undefined }
        : { cost: plan.remaining.cost, quantity: plan.remaining.pieces ?? item.quantity };
  if (item.diamond && plan.remaining.carats !== undefined && item.identityModel !== "UNIQUE") patch.diamond = { ...item.diamond, caratWeight: plan.remaining.carats };
  inventoryStore.update(item.id, patch, itemLedger(`${label ? `${label} taken` : "Taken"} into job ${jobId}${plan.emptiesItem && label ? " — parcel used up" : ""}.`, actor));

  const entry: JobCostEntry = {
    id: newId("JC"),
    occurredAt: today(),
    source: "StockConsumption",
    bucket: payload.bucket,
    description: `${item.code} · ${item.title}${label ? ` — ${label}` : ""}`,
    amountBase: plan.amount,
    inventoryItemId: item.id,
    quantity,
    actor,
  };
  return store.update(jobId, {
    costEntries: [...job.costEntries, entry],
    activity: [activity(`Used from stock: ${entry.description}.`, actor), ...job.activity],
  });
}

/* ------------------------------------------------------------------ job → stock */

/** Gives material back to the item it came from, at the rate it was taken. No quantity = all that is still out. */
export async function returnToStock(jobId: string, consumptionId: string, give: TakeQuantity = {}, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireOpenJob(jobId);
  const consumption = requireConsumption(job, consumptionId);
  const item = consumption.inventoryItemId ? inventoryStore.getById(consumption.inventoryItemId) : undefined;
  if (!item) throw new MaterialError("The stock item it came from no longer exists.");
  const plan = planReturn(job, consumption, give);
  const label = describeQuantity(plan.quantity);

  if (item.identityModel === "UNIQUE") {
    if (item.status !== "Consumed" || item.jobId !== jobId) throw new MaterialError(`${item.code} is ${item.status}, not held by this job.`);
    inventoryStore.update(item.id, { status: "Available", jobId: undefined }, itemLedger(`Returned to stock from job ${jobId}.`, actor, "TRANSFER"));
  } else {
    if (item.status === "Sold" || item.status === "Returned to vendor" || item.status === "Lost") throw new MaterialError(`${item.code} is ${item.status} — return the material as a new parcel instead.`);
    const carats = parcelCarats(item) ?? 0;
    const patch: Partial<InventoryItem> = {
      cost: Math.round((item.cost + plan.amount) * 100) / 100,
      quantity: item.quantity !== undefined || plan.quantity?.pieces ? (item.quantity ?? 0) + (plan.quantity?.pieces ?? 0) : undefined,
      status: item.status === "Consumed" ? "Available" : item.status,
      jobId: item.status === "Consumed" ? undefined : item.jobId,
    };
    if (item.diamond && plan.quantity?.carats) patch.diamond = { ...item.diamond, caratWeight: round3(carats + plan.quantity.carats) };
    inventoryStore.update(item.id, patch, itemLedger(`${label || "Material"} returned to stock from job ${jobId}.`, actor, "TRANSFER"));
  }

  const entry: JobCostEntry = {
    id: newId("JC"),
    occurredAt: today(),
    source: "ReturnToStock",
    bucket: consumption.bucket,
    description: `${item.code} back to stock${label ? ` — ${label}` : ""}`,
    amountBase: -plan.amount,
    inventoryItemId: item.id,
    quantity: plan.quantity,
    reversesEntryId: consumption.id,
    actor,
  };
  return store.update(jobId, {
    costEntries: [...job.costEntries, entry],
    activity: [activity(`Returned to stock: ${entry.description}.`, actor), ...job.activity],
  });
}

/** A whole stone broken or lost in production. Its cost stays on the job — it is still part of what the job cost. */
export async function markStoneLost(jobId: string, consumptionId: string, note: string, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireOpenJob(jobId);
  const consumption = requireConsumption(job, consumptionId);
  if (consumption.quantity) throw new MaterialError("Only a whole stone can be marked lost. For a parcel, return what's left and the rest stays on the job.");
  if (consumption.outcome === "Lost") return job;
  if (outstandingFor(job, consumption).amount <= 0.005) throw new MaterialError("That stone has already gone back to stock.");
  const item = consumption.inventoryItemId ? inventoryStore.getById(consumption.inventoryItemId) : undefined;
  const why = note.trim() || "broken or lost in production";
  if (item) inventoryStore.update(item.id, { status: "Lost" }, itemLedger(`Lost in job ${jobId}: ${why}.`, actor, "COUNT_ADJUSTMENT"));
  return store.update(jobId, {
    costEntries: job.costEntries.map((e) => (e.id === consumptionId ? { ...e, outcome: "Lost" as const } : e)),
    activity: [activity(`Marked lost: ${consumption.description} — ${why}.`, actor), ...job.activity],
  });
}

export interface LeftoverPayload extends TakeQuantity {
  category: string;
  title: string;
  description: string;
  location: string;
  /** What the leftover is worth, base currency — taken off the job's cost. */
  amountBase: number;
  bucket: CostBucket;
  shape?: string;
  color?: string;
  clarity?: string;
}

/**
 * Material bought straight onto the job (melee on a job invoice) that wasn't all used. Becomes a new stock
 * parcel carrying the value moved off the job, so the next job can use it.
 */
export async function addLeftoverToStock(jobId: string, payload: LeftoverPayload, actor = DEFAULT_ACTOR): Promise<{ job: JobOrder | undefined; item: InventoryItem }> {
  const job = requireOpenJob(jobId);
  const category = catalogStore.getCategory(payload.category);
  if (!category) throw new MaterialError("Choose a stock category.");
  if (!payload.title.trim()) throw new MaterialError("Name the parcel.");
  if (!((payload.pieces ?? 0) > 0 || (payload.carats ?? 0) > 0)) throw new MaterialError("Enter the carats or pieces going back.");
  if (!(payload.amountBase > 0)) throw new MaterialError("Enter the value going back to stock.");
  const jobTotal = summarizeJobCost(buildJobLedger(job, purchaseOrderStore.getAll()), job.estimate).total;
  if (payload.amountBase > jobTotal + 0.005) throw new MaterialError(`The job has only ${jobTotal.toFixed(2)} of cost — the leftover can't be worth more.`);

  const code = nextStockNumber(category, inventoryStore.getAll().map((i) => i.code));
  const isDiamond = payload.category === "Diamond";
  const item: InventoryItem = {
    id: code,
    code,
    category: payload.category,
    identityModel: "LOT",
    quantity: payload.pieces || undefined,
    title: payload.title.trim(),
    description: payload.description.trim(),
    status: "Available",
    location: payload.location,
    custodyHolder: "OctaGem Demo Co.",
    cost: payload.amountBase,
    askingPrice: 0,
    receivedAt: today(),
    ownership: "OWNED",
    diamond: isDiamond
      ? {
          shape: payload.shape ?? "",
          caratWeight: payload.carats ?? 0,
          color: payload.color ?? "",
          clarity: payload.clarity ?? "",
          lab: "None",
          certificateNumber: "",
          isLabGrown: false,
        }
      : undefined,
    media: [],
    ledger: [{ id: newId("ledger"), occurredAt: today(), type: "TRANSFER", note: `Leftover returned to stock from job ${jobId}.`, actor }],
  };
  inventoryStore.insert(item);

  const quantity = { pieces: payload.pieces || undefined, carats: payload.carats || undefined };
  const entry: JobCostEntry = {
    id: newId("JC"),
    occurredAt: today(),
    source: "ReturnToStock",
    bucket: payload.bucket,
    description: `Leftover to stock as ${code} — ${describeQuantity(quantity)}`,
    amountBase: -payload.amountBase,
    inventoryItemId: code,
    quantity,
    actor,
  };
  const updated = store.update(jobId, {
    costEntries: [...job.costEntries, entry],
    activity: [activity(`${entry.description}.`, actor), ...job.activity],
  });
  return { job: updated, item };
}

/* ------------------------------------------------------------------ customer-supplied material */

export type CustomerMaterialPayload = Omit<CustomerMaterial, "id" | "status" | "statusChangedAt">;

export async function addCustomerMaterial(jobId: string, payload: CustomerMaterialPayload, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = requireOpenJob(jobId);
  if (!payload.description.trim()) throw new MaterialError("Describe what the customer handed over.");
  const material: CustomerMaterial = { ...payload, description: payload.description.trim(), notes: payload.notes.trim(), id: newId("CM"), status: "Held" };
  return store.update(jobId, {
    customerMaterials: [...job.customerMaterials, material],
    activity: [activity(`Received from customer: ${material.description}.`, actor), ...job.activity],
  });
}

const STATUS_NOTE: Record<CustomerMaterialStatus, string> = { Held: "back to held", Used: "used in the piece", Returned: "returned to the customer" };

export async function setCustomerMaterialStatus(jobId: string, materialId: string, status: CustomerMaterialStatus, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = store.getById(jobId);
  if (!job) throw new MaterialError(`Job order ${jobId} no longer exists.`);
  const material = job.customerMaterials.find((m) => m.id === materialId);
  if (!material || material.status === status) return job;
  return store.update(jobId, {
    customerMaterials: job.customerMaterials.map((m) => (m.id === materialId ? { ...m, status, statusChangedAt: today() } : m)),
    activity: [activity(`Customer's ${material.description}: ${STATUS_NOTE[status]}.`, actor), ...job.activity],
  });
}

export async function removeCustomerMaterial(jobId: string, materialId: string, actor = DEFAULT_ACTOR): Promise<JobOrder | undefined> {
  const job = store.getById(jobId);
  if (!job) throw new MaterialError(`Job order ${jobId} no longer exists.`);
  const material = job.customerMaterials.find((m) => m.id === materialId);
  if (!material) return job;
  if (material.status !== "Held") throw new MaterialError("Only material still held can be removed — it's part of the custody record once used or returned.");
  return store.update(jobId, {
    customerMaterials: job.customerMaterials.filter((m) => m.id !== materialId),
    activity: [activity(`Removed customer material entered by mistake: ${material.description}.`, actor), ...job.activity],
  });
}
