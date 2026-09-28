import { beforeEach, describe, expect, it } from "vitest";
import { commitImport, getImportContext, listImportBatches, undoImport } from "@/lib/api/importApi";
import { updateItemDetails } from "@/lib/api/inventoryApi";
import { buildImportPlan } from "@/lib/inventory/importPlan";
import { getAll, getById } from "@/lib/store/inventoryStore";
import { installMemoryStorage } from "@/test/memoryStorage";

beforeEach(() => {
  installMemoryStorage();
});

const mapping = ["code", "title", "diamond.shape", "diamond.caratWeight", "diamond.lab", "diamond.certificateNumber", "cost", "askingPrice"];
const good = (code: string, cert: string) => [code, `Stone ${code}`, "Round", "1.01", "GIA", cert, "4000", "5200"];

async function plan(rows: unknown[][], mode: "create" | "upsert" = "create") {
  return buildImportPlan(rows, mapping, { mode, categoryKey: "Diamond" }, await getImportContext());
}

describe("commitImport", () => {
  it("imports the valid rows, skips the rest, and records the batch", async () => {
    const before = getAll().length;
    const result = await plan([good("D-6001", "C1"), good("D-6002", "C1"), good("", "C3")]);
    const batch = await commitImport(result, { fileName: "stones.xlsx" });

    expect(batch).toMatchObject({ fileName: "stones.xlsx", createdIds: ["D-6001", "D-6003"], skippedRows: 1, mode: "create" });
    expect(getAll().length).toBe(before + 2);
    const item = getById("D-6001")!;
    expect(item).toMatchObject({ status: "Available", ownership: "OWNED", cost: 4000, identityModel: "UNIQUE" });
    expect(item.diamond).toMatchObject({ shape: "Round", caratWeight: 1.01, certificateNumber: "C1", isLabGrown: false });
    expect(item.ledger[0]).toMatchObject({ type: "PURCHASE_RECEIPT", batchId: batch.id });
    expect(item.ledger[0].note).toContain("stones.xlsx, row 2");
    expect((await listImportBatches())[0].id).toBe(batch.id);
  });

  it("refuses everything in all-or-nothing mode when any row fails", async () => {
    const before = getAll().length;
    const result = await plan([good("D-6001", "C1"), good("D-6002", "C1")]);
    await expect(commitImport(result, { fileName: "x.csv", allOrNothing: true })).rejects.toThrow("1 row has errors — nothing was imported");
    expect(getAll().length).toBe(before);
  });

  it("writes nothing if any insert collides at commit time", async () => {
    const result = await plan([good("D-6001", "C1"), good("D-6002", "C2")]);
    await commitImport(await plan([good("D-6002", "C9")]), { fileName: "first.csv" });
    const before = getAll().length;
    await expect(commitImport(result, { fileName: "stale.csv" })).rejects.toThrow("D-6002 is already in use");
    expect(getAll().length).toBe(before);
    expect(getById("D-6001")).toBeUndefined();
  });

  it("updates existing items in upsert mode and keeps their history and photos", async () => {
    const cells = mapping.map((key) => (key === "code" ? "D-1042" : key === "askingPrice" ? "12,500" : ""));
    const original = getById("D-1042")!;
    const batch = await commitImport(await plan([cells], "upsert"), { fileName: "prices.csv" });
    const item = getById("D-1042")!;
    expect(item.askingPrice).toBe(12500);
    expect(item.diamond?.certificateNumber).toBe(original.diamond?.certificateNumber);
    expect(item.ledger.length).toBe(original.ledger.length + 1);
    expect(batch.updated[0]).toMatchObject({ id: "D-1042" });
    expect("media" in batch.updated[0].before).toBe(false);
  });
});

describe("undoImport", () => {
  it("removes created items and restores updated ones", async () => {
    const before = getAll().length;
    const original = getById("D-1042")!;
    const cells = mapping.map((key) => (key === "code" ? "D-1042" : key === "askingPrice" ? "1" : ""));
    const batch = await commitImport(await plan([good("D-6001", "C1"), cells], "upsert"), { fileName: "mixed.csv" });

    const undone = await undoImport(batch.id);
    expect(undone.undoneAt).toBeDefined();
    expect(undone.undoSkipped).toEqual([]);
    expect(getAll().length).toBe(before);
    expect(getById("D-1042")).toEqual(original);
  });

  it("leaves items that changed after the import and says so", async () => {
    const batch = await commitImport(await plan([good("D-6001", "C1"), good("D-6002", "C2")]), { fileName: "a.csv" });
    const touched = getById("D-6002")!;
    await updateItemDetails(touched.id, { title: "Re-graded", description: "", location: touched.location, cost: 1, askingPrice: 2, diamond: touched.diamond });

    const undone = await undoImport(batch.id);
    expect(undone.undoSkipped).toEqual(["D-6002"]);
    expect(getById("D-6001")).toBeUndefined();
    expect(getById("D-6002")?.title).toBe("Re-graded");
  });

  it("cannot be undone twice", async () => {
    const batch = await commitImport(await plan([good("D-6001", "C1")]), { fileName: "a.csv" });
    await undoImport(batch.id);
    await expect(undoImport(batch.id)).rejects.toThrow("already undone");
  });
});
