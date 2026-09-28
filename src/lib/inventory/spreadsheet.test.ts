import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { getImportContext } from "@/lib/api/importApi";
import { normaliseToken } from "@/lib/inventory/fieldValues";
import { autoMapColumns, buildImportPlan, detectHeaderRow } from "@/lib/inventory/importPlan";
import { buildWorkbookSpec, headerFor, itemToRow, sheetName } from "@/lib/inventory/sheetSpec";
import { readSpreadsheet, writeWorkbook, writeErrorReport } from "@/lib/inventory/spreadsheet";
import { getList } from "@/lib/store/masterDataStore";
import { getAll } from "@/lib/store/inventoryStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import type { FieldDefinition } from "@/types/catalog";
import type { MasterListKey } from "@/types/masterData";

beforeEach(() => {
  installMemoryStorage();
});

async function spec() {
  const context = await getImportContext();
  return {
    context,
    spec: buildWorkbookSpec({
      categories: context.categories,
      fieldsFor: context.fieldsFor,
      listValues: (field, category) =>
        field.source?.kind === "masterList" && field.source.scopedByField
          ? getList(field.source.key as MasterListKey).map((e) => e.label)
          : context.optionsFor(field, {}, category),
      dateOrder: context.dateOrder,
      companyName: "OctaGem Demo Co.",
    }),
  };
}

describe("sheetSpec", () => {
  it("names sheets safely and marks required headers with units", () => {
    expect(sheetName("Gold / Silver: [bulk]")).toBe("Gold   Silver   bulk");
    const carat = { label: "Carat", unit: "ct", required: true } as FieldDefinition;
    expect(headerFor(carat)).toBe("Carat (ct) *");
    expect(headerFor({ label: "Depth %", unit: "%", required: false } as FieldDefinition)).toBe("Depth %");
  });

  it("builds one sheet per category, drops the identity column where only one model is allowed, and shares identical lists", async () => {
    const { spec: workbook } = await spec();
    expect(workbook.sheets.map((s) => s.name)).toEqual(["Diamond", "Jewelry", "Watch"]);
    const watch = workbook.sheets.find((s) => s.name === "Watch")!;
    expect(watch.columns.some((c) => c.fieldKey === "identityModel")).toBe(false);
    const diamond = workbook.sheets.find((s) => s.name === "Diamond")!;
    const cut = diamond.columns.find((c) => c.fieldKey === "diamond.cut")!;
    const polish = diamond.columns.find((c) => c.fieldKey === "diamond.polish")!;
    expect(cut.listId).toBe(polish.listId);
    const karat = workbook.lists.find((l) => l.id === workbook.sheets[1].columns.find((c) => c.fieldKey === "jewelry.metalKarat")!.listId)!;
    expect(karat.values).toEqual(expect.arrayContaining(["18K", "950 Platinum"]));
    expect(diamond.columns.find((c) => c.fieldKey === "code")).toMatchObject({ header: "Stock number", required: false });
    expect(diamond.columns.find((c) => c.fieldKey === "code")!.note).toContain("Leave blank to number automatically");
  });
});

describe("Excel round trip", () => {
  it("writes a template with dropdowns on list columns and reads back only the data sheets", async () => {
    const { spec: workbook } = await spec();
    const buffer = await writeWorkbook(workbook);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    expect(reloaded.getWorksheet("Lists")!.state).toBe("hidden");
    const diamondSheet = reloaded.getWorksheet("Diamond")!;
    const shapeColumn = workbook.sheets[0].columns.findIndex((c) => c.fieldKey === "diamond.shape") + 1;
    expect(diamondSheet.getRow(1).getCell(shapeColumn).value).toBe("Shape *");
    expect(diamondSheet.getCell(2, shapeColumn).dataValidation).toMatchObject({ type: "list", errorStyle: "stop" });

    const sheets = await readSpreadsheet(buffer, "template.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Diamond", "Jewelry", "Watch"]);
    expect(sheets[0].rows).toHaveLength(1); // header only
  });

  it("re-imports its own export as updates with no errors and no changed values", async () => {
    const { spec: workbook, context } = await spec();
    const items = getAll();
    const dataBySheet: Record<string, unknown[][]> = {};
    for (const sheet of workbook.sheets) {
      const fieldsByKey = new Map(context.fieldsFor(sheet.categoryKey).map((f) => [f.key, f]));
      dataBySheet[sheet.name] = items.filter((i) => i.category === sheet.categoryKey).map((item) => itemToRow(item, sheet, fieldsByKey));
    }
    const buffer = await writeWorkbook(workbook, dataBySheet);
    const sheets = await readSpreadsheet(buffer, "export.xlsx");

    let updates = 0;
    for (const sheet of sheets) {
      const categoryKey = workbook.sheets.find((s) => s.name === sheet.name)!.categoryKey;
      const fields = context.fieldsFor(categoryKey);
      const headerIndex = detectHeaderRow(sheet.rows, fields);
      const mapping = autoMapColumns(sheet.rows[headerIndex], fields);
      expect(mapping.every((key) => key !== null)).toBe(true);
      const plan = buildImportPlan(sheet.rows.slice(headerIndex + 1), mapping, { mode: "upsert", categoryKey }, context, headerIndex);
      expect(plan.rows.filter((r) => r.errors.length).map((r) => [r.code, r.errors])).toEqual([]);
      updates += plan.summary.update;
      for (const row of plan.rows) {
        const item = items.find((i) => i.id === row.existingId)!;
        for (const [key, value] of Object.entries(row.values)) {
          const field = fields.find((f) => f.key === key)!;
          const path = field.path.split(".");
          const stored = path.reduce<unknown>((node, segment) => (node as Record<string, unknown> | undefined)?.[segment], item);
          // Values come back identical, bar canonical spelling applied by validation ("Very good" → "Very Good",
          // "New York · Vault A" → "New York › Vault A").
          const same = (v: unknown) => (typeof v === "string" ? normaliseToken(v) : v);
          expect(same(value)).toEqual(same(stored));
        }
      }
    }
    expect(updates).toBe(items.length);
  });

  it("writes an error report the user can fix and re-upload", async () => {
    const buffer = await writeErrorReport([{ name: "Diamond", header: ["Stock number *", "Shape *"], rows: [{ rowNumber: 5, cells: ["D-9", "Rnd"], errors: 'Shape: "Rnd" is not an allowed value' }] }]);
    const [sheet] = await readSpreadsheet(buffer, "errors.xlsx");
    expect(sheet.rows).toEqual([
      ["Import errors", "Row", "Stock number *", "Shape *"],
      ['Shape: "Rnd" is not an allowed value', 5, "D-9", "Rnd"],
    ]);
  });
});
