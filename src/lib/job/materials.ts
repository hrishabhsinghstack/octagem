import type { InventoryItem } from "@/types/inventory";
import type { JobCostEntry, JobOrder } from "@/types/jobOrder";

/**
 * Materials taken from stock into a job, and given back. Pure — the API layer (lib/api/jobMaterialsApi.ts)
 * does the writes. Quantities are carats and/or pieces; a whole UNIQUE stone has no quantity at all.
 */

export class MaterialError extends Error {}

export interface TakeQuantity {
  pieces?: number;
  carats?: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Total weight a parcel holds, when it is a diamond parcel with a recorded weight. */
export function parcelCarats(item: InventoryItem): number | undefined {
  const carats = item.diamond?.caratWeight;
  return carats !== undefined && carats > 0 ? carats : undefined;
}

export interface ConsumptionPlan {
  /** Share of the item's cost being taken, 0–1. */
  fraction: number;
  amount: number;
  /** True when nothing remains in stock afterwards — the item becomes Consumed. */
  emptiesItem: boolean;
  remaining: { cost: number; carats?: number; pieces?: number };
}

/**
 * What taking `take` out of `item` costs and leaves behind. A UNIQUE item is always taken whole. A parcel is
 * priced by weight when it has one and carats are given — melee is bought and used by the carat, so a carat
 * share is the honest cost — otherwise by pieces.
 */
export function planConsumption(item: InventoryItem, take: TakeQuantity): ConsumptionPlan {
  if (item.identityModel === "UNIQUE") return { fraction: 1, amount: item.cost, emptiesItem: true, remaining: { cost: 0 } };

  const carats = parcelCarats(item);
  const pieces = item.quantity;
  const takeCarats = take.carats ?? 0;
  const takePieces = take.pieces ?? 0;
  if (takeCarats < 0 || takePieces < 0) throw new MaterialError("Quantities can't be negative.");
  if (takeCarats === 0 && takePieces === 0) throw new MaterialError("Enter how many carats or pieces to take.");
  if (takeCarats > 0 && carats === undefined) throw new MaterialError(`${item.code} has no recorded weight — take it by pieces.`);
  if (takePieces > 0 && pieces === undefined) throw new MaterialError(`${item.code} has no piece count — take it by carats.`);
  if (carats !== undefined && takeCarats > carats + 1e-9) throw new MaterialError(`${item.code} holds only ${carats} ct.`);
  if (pieces !== undefined && takePieces > pieces) throw new MaterialError(`${item.code} holds only ${pieces} pieces.`);

  const fraction = takeCarats > 0 && carats ? takeCarats / carats : takePieces / pieces!;
  const amount = round2(item.cost * fraction);
  const remainingCarats = carats !== undefined ? round3(carats - takeCarats) : undefined;
  const remainingPieces = pieces !== undefined ? pieces - takePieces : undefined;
  const emptiesItem = fraction >= 1 - 1e-9 || remainingCarats === 0 || remainingPieces === 0;
  return {
    fraction,
    amount: emptiesItem ? item.cost : amount,
    emptiesItem,
    remaining: { cost: emptiesItem ? 0 : round2(item.cost - amount), carats: remainingCarats, pieces: remainingPieces },
  };
}

export interface OutstandingMaterial {
  pieces: number;
  carats: number;
  amount: number;
}

/** What a consumption entry still has on the job: taken, minus everything given back against it. */
export function outstandingFor(job: Pick<JobOrder, "costEntries">, consumption: JobCostEntry): OutstandingMaterial {
  const returns = job.costEntries.filter((e) => e.source === "ReturnToStock" && e.reversesEntryId === consumption.id);
  const returned = returns.reduce(
    (sum, e) => ({ pieces: sum.pieces + (e.quantity?.pieces ?? 0), carats: sum.carats + (e.quantity?.carats ?? 0), amount: sum.amount - e.amountBase }),
    { pieces: 0, carats: 0, amount: 0 },
  );
  return {
    pieces: (consumption.quantity?.pieces ?? 0) - returned.pieces,
    carats: round3((consumption.quantity?.carats ?? 0) - returned.carats),
    amount: round2(consumption.amountBase - returned.amount),
  };
}

/** Stock consumptions still (wholly or partly) on the job and not lost — what must go back before the job can be cancelled. */
export function materialsHeld(job: Pick<JobOrder, "costEntries">): JobCostEntry[] {
  return job.costEntries.filter((e) => e.source === "StockConsumption" && e.outcome !== "Lost" && outstandingFor(job, e).amount > 0.005);
}

/**
 * The cost and quantity of giving back part of a consumption, at the same rate it was taken. Returning
 * nothing specific returns everything still outstanding.
 */
export function planReturn(job: Pick<JobOrder, "costEntries">, consumption: JobCostEntry, give: TakeQuantity): { amount: number; quantity?: TakeQuantity } {
  if (consumption.outcome === "Lost") throw new MaterialError("This stone was marked lost — it can't go back to stock.");
  const left = outstandingFor(job, consumption);
  if (left.amount <= 0.005) throw new MaterialError("Everything taken here has already gone back to stock.");
  if (!consumption.quantity) return { amount: left.amount };

  const giveCarats = give.carats ?? 0;
  const givePieces = give.pieces ?? 0;
  if (giveCarats === 0 && givePieces === 0) return { amount: left.amount, quantity: { pieces: left.pieces || undefined, carats: left.carats || undefined } };
  if (giveCarats < 0 || givePieces < 0) throw new MaterialError("Quantities can't be negative.");
  if (giveCarats > left.carats + 1e-9) throw new MaterialError(`Only ${left.carats} ct is still on the job.`);
  if (givePieces > left.pieces) throw new MaterialError(`Only ${left.pieces} pieces are still on the job.`);

  const taken = consumption.quantity;
  const fraction = giveCarats > 0 && taken.carats ? giveCarats / taken.carats : givePieces / (taken.pieces || 1);
  const amount = Math.min(left.amount, round2(consumption.amountBase * fraction));
  return { amount, quantity: { pieces: givePieces || undefined, carats: giveCarats || undefined } };
}
