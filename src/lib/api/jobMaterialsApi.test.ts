import { addCustomerMaterial, addLeftoverToStock, consumeFromStock, markStoneLost, returnToStock, setCustomerMaterialStatus } from "@/lib/api/jobMaterialsApi";
import { createJobOrder, getJobOrder, setJobStatus } from "@/lib/api/jobOrderApi";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { buildJobLedger, summarizeJobCost } from "@/lib/job/costing";
import { outstandingFor } from "@/lib/job/materials";
import { getById as getItem } from "@/lib/store/inventoryStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  installMemoryStorage();
});

const newJob = () => createJobOrder({ type: "Production", title: "Materials test", notes: "", overheadPct: 0 });

async function jobTotal(jobId: string) {
  const job = (await getJobOrder(jobId))!;
  return summarizeJobCost(buildJobLedger(job, await listPurchaseOrders()), job.estimate).total;
}

const consumption = async (jobId: string) => (await getJobOrder(jobId))!.costEntries.find((e) => e.source === "StockConsumption")!;

// Seed stock: D-1042 is a whole GIA stone (cost 6,200). D-1125 is a melee parcel — 3.00 ct, 220 pcs, cost 1,950 (650/ct).

describe("using a whole stone", () => {
  it("charges its cost to the job and marks it consumed, keeping its own cost", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1042", bucket: "Stones" });
    expect(await jobTotal(job.id)).toBe(6200);
    expect(getItem("D-1042")).toMatchObject({ status: "Consumed", jobId: job.id, cost: 6200 });
    expect(getItem("D-1042")!.ledger[0]).toMatchObject({ type: "PRODUCTION_CONSUMPTION" });
  });

  it("goes back to stock whole", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1042", bucket: "Stones" });
    await returnToStock(job.id, (await consumption(job.id)).id);
    expect(await jobTotal(job.id)).toBe(0);
    expect(getItem("D-1042")).toMatchObject({ status: "Available", cost: 6200 });
    expect(getItem("D-1042")!.jobId).toBeUndefined();
  });

  it("can be marked lost — cost stays on the job, and it can't then come back", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1042", bucket: "Stones" });
    const entry = await consumption(job.id);
    await markStoneLost(job.id, entry.id, "chipped while setting");
    expect(await jobTotal(job.id)).toBe(6200);
    expect(getItem("D-1042")!.status).toBe("Lost");
    await expect(returnToStock(job.id, entry.id)).rejects.toThrow(/lost/);
  });

  it("refuses stock that isn't available, or isn't ours", async () => {
    const job = await newJob();
    await expect(consumeFromStock(job.id, { itemId: "D-1077", bucket: "Stones" })).rejects.toThrow(/On memo out/);
    await expect(consumeFromStock(job.id, { itemId: "D-1150", bucket: "Stones" })).rejects.toThrow(/consignment/);
  });
});

describe("using part of a parcel", () => {
  it("prices by the carat and leaves the rest in stock", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1125", bucket: "Stones", carats: 0.6, pieces: 44 });
    expect(await jobTotal(job.id)).toBe(390);
    expect(getItem("D-1125")).toMatchObject({ status: "Available", cost: 1560, quantity: 176 });
    expect(getItem("D-1125")!.diamond!.caratWeight).toBe(2.4);
  });

  it("refuses more than the parcel holds", async () => {
    const job = await newJob();
    await expect(consumeFromStock(job.id, { itemId: "D-1125", bucket: "Stones", carats: 3.5 })).rejects.toThrow(/only 3 ct/);
  });

  it("empties the parcel when everything is taken", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1125", bucket: "Stones", carats: 3 });
    expect(await jobTotal(job.id)).toBe(1950);
    expect(getItem("D-1125")).toMatchObject({ status: "Consumed", cost: 0 });
  });

  it("gives part back at the rate it was taken, and no more than is still out", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1125", bucket: "Stones", carats: 1 });
    const entry = await consumption(job.id);
    await returnToStock(job.id, entry.id, { carats: 0.4 });
    expect(await jobTotal(job.id)).toBe(390);
    expect(getItem("D-1125")!.diamond!.caratWeight).toBe(2.4);
    expect(getItem("D-1125")!.cost).toBe(1560);
    expect(outstandingFor((await getJobOrder(job.id))!, entry)).toMatchObject({ carats: 0.6, amount: 390 });
    await expect(returnToStock(job.id, entry.id, { carats: 0.7 })).rejects.toThrow(/Only 0.6 ct/);
  });
});

describe("leftover bought on the job", () => {
  it("becomes a new stock parcel and comes off the job's cost", async () => {
    const job = await newJob();
    await consumeFromStock(job.id, { itemId: "D-1125", bucket: "Stones", carats: 1 });
    const { item } = await addLeftoverToStock(job.id, { category: "Diamond", title: "Leftover melee", description: "", location: "Vault", carats: 0.2, amountBase: 130, bucket: "Stones" });
    expect(item).toMatchObject({ identityModel: "LOT", status: "Available", cost: 130, code: "D-1151" });
    expect(item.diamond!.caratWeight).toBe(0.2);
    expect(await jobTotal(job.id)).toBe(520);
  });

  it("can't be worth more than the job has cost", async () => {
    const job = await newJob();
    await expect(addLeftoverToStock(job.id, { category: "Diamond", title: "X", description: "", location: "Vault", carats: 0.2, amountBase: 50, bucket: "Stones" })).rejects.toThrow(/can't be worth more/);
  });
});

describe("customer-supplied material and cancelling", () => {
  it("tracks the customer's stone at no cost, and blocks cancelling while anything is held", async () => {
    const job = await newJob();
    await addCustomerMaterial(job.id, { receivedAt: "2026-10-01", kind: "Diamond", description: "Customer's 1ct oval", carats: 1, pieces: 1, notes: "" });
    expect(await jobTotal(job.id)).toBe(0);
    await consumeFromStock(job.id, { itemId: "D-1042", bucket: "Stones" });

    await expect(setJobStatus(job.id, "Cancelled")).rejects.toThrow(/D-1042/);
    await returnToStock(job.id, (await consumption(job.id)).id);
    await expect(setJobStatus(job.id, "Cancelled")).rejects.toThrow(/customer's material/);

    const material = (await getJobOrder(job.id))!.customerMaterials[0];
    await setCustomerMaterialStatus(job.id, material.id, "Returned");
    expect((await setJobStatus(job.id, "Cancelled"))!.status).toBe("Cancelled");
  });
});
