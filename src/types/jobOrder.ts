/**
 * Jewelry job work (docs/plans/jewelry-job-work.md). A Job Order is the project a batch of jewelry
 * is made under: vendor invoices are added to it (and stored as purchase orders, so Purchasing still
 * sees every purchase in one list), in-house costs are recorded on it, and — in a later phase —
 * finished products are generated from it carrying their share of the cost.
 *
 * The job never copies invoice lines. Its cost ledger is built on read from "purchase-order lines whose
 * destination is this job" plus the job's own `costEntries`, so editing an invoice can't leave a stale
 * copy behind (lib/job/costing.ts).
 */

/** "Repair" (a customer's own piece, no product, no inventory) is reserved for a later phase. */
export type JobType = "Production" | "CustomerOrder" | "Rework";

/** Closing a job (freezing product costs) arrives with product costing; until then a job runs Open → In production → Completed. */
export type JobStatus = "Open" | "In production" | "Completed" | "Cancelled";

/**
 * What a cost is for. A fixed set rather than a master list: product cost breakdowns, estimate vs.
 * actual and reports all group by it, so a tenant renaming or deleting a bucket would orphan history.
 */
export type CostBucket = "Stones" | "Metal" | "CAD" | "Casting" | "Setting" | "Labour" | "Findings" | "LandedCost" | "Overhead" | "Other";

export const COST_BUCKETS: CostBucket[] = ["Stones", "Metal", "CAD", "Casting", "Setting", "Labour", "Findings", "LandedCost", "Overhead", "Other"];

export const COST_BUCKET_LABELS: Record<CostBucket, string> = {
  Stones: "Stones",
  Metal: "Metal",
  CAD: "CAD / design",
  Casting: "Casting",
  Setting: "Setting",
  Labour: "Labour",
  Findings: "Findings",
  LandedCost: "Shipping & duty",
  Overhead: "Overhead",
  Other: "Other",
};

/**
 * A cost recorded on the job itself, not on a vendor invoice. Phase 1 writes only "Internal" (in-house
 * wages, cash fees). The other sources are declared now because the ledger, the job screen and the
 * stored data must already accept them when materials and product costing land.
 */
export type JobCostEntrySource = "Internal" | "StockConsumption" | "ReturnToStock" | "Loss" | "Variance";

export interface JobCostEntry {
  id: string;
  occurredAt: string;
  source: JobCostEntrySource;
  bucket: CostBucket;
  description: string;
  /** Base currency, signed — returns and credits are negative. */
  amountBase: number;
  /** Set when entered as hours × rate, so the screen can show how the amount was reached. */
  hours?: number;
  ratePerHour?: number;
  actor: string;
}

export interface JobActivity {
  id: string;
  occurredAt: string;
  actor: string;
  note: string;
}

export interface JobOrder {
  /** JO-0001 — see nextJobOrderId in lib/store/jobOrderStore.ts. */
  id: string;
  type: JobType;
  title: string;
  /** Required for CustomerOrder, optional otherwise. */
  customerId?: string;
  status: JobStatus;
  openedAt: string;
  targetDate?: string;
  notes: string;
  /** Budget per bucket, base currency — what a quotation/proforma said the job would cost. */
  estimate: Partial<Record<CostBucket, number>>;
  /** Workshop overhead loaded on top of every other cost, as a percentage. 0 = none. */
  overheadPct: number;
  costEntries: JobCostEntry[];
  activity: JobActivity[];
}
