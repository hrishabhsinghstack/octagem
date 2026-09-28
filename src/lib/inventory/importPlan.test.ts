import { beforeEach, describe, expect, it } from "vitest";
import { mockInventory } from "@/data/mockInventory";
import { BUILT_IN_CATEGORIES } from "@/lib/inventory/builtInFields";
import { CATEGORY_COLUMN, autoMapColumns, buildImportPlan, detectDelimiter, detectHeaderRow, normaliseHeader, parseDelimited, type ImportContext } from "@/lib/inventory/importPlan";
import { fieldsForCategory, optionsForField, type CatalogState, type OptionLookups } from "@/lib/inventory/registry";
import { getList } from "@/lib/store/masterDataStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import type { InventoryItem } from "@/types/inventory";
import type { MasterListKey } from "@/types/masterData";

const state: CatalogState = { categories: BUILT_IN_CATEGORIES, overrides: {}, tenantFields: [], customFields: [], enabledPacks: [] };
const lookups: OptionLookups = { getList: (key) => getList(key as MasterListKey), locationPaths: () => ["New York › Receiving", "New York › Vault A"] };

const context = (existing: InventoryItem[] = structuredClone(mockInventory) as InventoryItem[]): ImportContext => ({
  categories: BUILT_IN_CATEGORIES,
  fieldsFor: (key) => fieldsForCategory(state, key),
  optionsFor: (field, resolved, category) => optionsForField(field, resolved, category, lookups),
  existing,
  dateOrder: "MDY",
});

beforeEach(() => {
  installMemoryStorage();
});

describe("parseDelimited", () => {
  it("handles quotes, doubled quotes, embedded delimiters and newlines, and a BOM", () => {
    const text = '﻿Stock #,Name,Notes\r\nD-1,"Round, 1ct","He said ""wow""\nline 2"\r\nD-2,Oval,';
    expect(parseDelimited(text)).toEqual([
      ["Stock #", "Name", "Notes"],
      ["D-1", "Round, 1ct", 'He said "wow"\nline 2'],
      ["D-2", "Oval", ""],
    ]);
  });

  it("detects tab (pasted from Excel) and semicolon (European CSV)", () => {
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("a;b;c\n1,5;2;3")).toBe(";");
    expect(detectDelimiter("a,b\n1,2")).toBe(",");
  });
});

describe("headers and mapping", () => {
  const diamondFields = fieldsForCategory(state, "Diamond");

  it("normalises template headers", () => {
    expect(normaliseHeader("Carat (ct) *")).toBe("carat");
    expect(normaliseHeader(" Certificate # ")).toBe("certificate#");
  });

  it("finds the header row below a title line", () => {
    const rows = [["SRK NY INC — stock list, Sept"], [], ["STONENUMBER", "SHAPE", "CARAT", "COLOR", "CLARITY"], ["D-1", "Round", "1.01", "G", "VS1"]];
    expect(detectHeaderRow(rows, diamondFields)).toBe(2);
  });

  it("maps legacy iDiamondCloud headers without manual work", () => {
    const mapping = autoMapColumns(["STONENUMBER", "SHAPE", "CARAT", "COLOR", "CLARITY", "LAB", "CERTIFICATE #", "PAVILLION A", "RAP PRICE", "Remarks", "Unknown col"], diamondFields);
    expect(mapping).toEqual(["code", "diamond.shape", "diamond.caratWeight", "diamond.color", "diamond.clarity", "diamond.lab", "diamond.certificateNumber", "diamond.pavilionAngle", "diamond.rapPricePerCarat", "description", null]);
  });

  it("matches a label containing brackets before stripping it as a unit", () => {
    expect(autoMapColumns(["Depth (mm)", "Depth %", "Carat (ct) *"], diamondFields)).toEqual(["diamond.depthMm", "diamond.depthPct", "diamond.caratWeight"]);
  });

  it("maps template headers and a category column, and ignores a second column claiming the same field", () => {
    expect(autoMapColumns(["Stock number *", "Category", "Carat (ct) *", "Weight"], diamondFields)).toEqual(["code", CATEGORY_COLUMN, "diamond.caratWeight", null]);
  });
});

describe("buildImportPlan", () => {
  const mapping = ["code", "title", "diamond.shape", "diamond.caratWeight", "diamond.color", "diamond.clarity", "diamond.lab", "diamond.certificateNumber", "cost", "askingPrice"];
  const row = (over: Partial<Record<string, unknown>> = {}) => {
    const base: Record<string, unknown> = {
      code: "D-5001",
      title: "1.01ct Round",
      "diamond.shape": "round",
      "diamond.caratWeight": "1.01",
      "diamond.color": "g",
      "diamond.clarity": "vs1",
      "diamond.lab": "GIA",
      "diamond.certificateNumber": "GIA 9990001",
      cost: "$4,000",
      askingPrice: "5,200",
      ...over,
    };
    return mapping.map((key) => base[key]);
  };
  const plan = (rows: unknown[][], over: Parameters<typeof buildImportPlan>[2] = { mode: "create", categoryKey: "Diamond" }) => buildImportPlan(rows, mapping, over, context());

  it("plans a clean row as a create with canonical values", () => {
    const result = plan([row()]);
    expect(result.summary).toMatchObject({ create: 1, error: 0 });
    expect(result.rows[0].values).toMatchObject({ code: "D-5001", "diamond.shape": "Round", "diamond.color": "G", "diamond.clarity": "VS1", cost: 4000, askingPrice: 5200, identityModel: "UNIQUE" });
  });

  it("numbers rows with a blank stock # from the category series, skipping codes used in the file", () => {
    const result = plan([row({ code: "", "diamond.certificateNumber": "A1" }), row({ code: "D-1151", "diamond.certificateNumber": "A2" }), row({ code: "", "diamond.certificateNumber": "A3" })]);
    expect(result.rows.map((r) => [r.code, r.autoNumbered ?? false])).toEqual([
      ["D-1152", true],
      ["D-1151", false],
      ["D-1153", true],
    ]);
  });

  it("reports sheet row numbers as the user sees them, skipping blank rows", () => {
    const result = buildImportPlan([row(), ["", null, "  "], row({ code: "D-5002", "diamond.certificateNumber": "X" })], mapping, { mode: "create", categoryKey: "Diamond" }, context(), 2);
    expect(result.rows.map((r) => r.rowNumber)).toEqual([4, 6]);
    expect(result.summary.blank).toBe(1);
  });

  it("refuses existing stock numbers in create mode", () => {
    const result = plan([row({ code: "d-1042" })]);
    expect(result.rows[0].errors[0].message).toContain('already exists — choose "Update existing"');
  });

  it("catches duplicates inside the file", () => {
    const result = plan([row(), row({ code: "D-5002" })]);
    expect(result.rows[1].errors).toEqual([{ fieldKey: "diamond.certificateNumber", message: 'Certificate # "GIA 9990001" is also on row 2' }]);
    const codes = plan([row(), row({ "diamond.certificateNumber": "OTHER" })]);
    expect(codes.rows[1].errors[0]).toMatchObject({ fieldKey: "code", message: 'Stock number "D-5001" is also on row 2' });
  });

  it("catches certificates already in stock", () => {
    const result = plan([row({ "diamond.certificateNumber": "GIA 2201948532" })]);
    expect(result.rows[0].errors[0].message).toContain("already used by D-1042");
  });

  it("groups each unknown value once, with its rows and a suggestion", () => {
    const result = plan([row({ "diamond.shape": "Rnd" }), row({ code: "D-5002", "diamond.shape": "rnd", "diamond.certificateNumber": "B" }), row({ code: "D-5003", "diamond.shape": "Ovl", "diamond.certificateNumber": "C" })]);
    expect(result.unknownValues.map((u) => [u.value, u.rows, u.suggestion, u.masterListKey])).toEqual([
      ["Rnd", [2, 3], "Round", "diamondShapes"],
      ["Ovl", [4], "Oval", "diamondShapes"],
    ]);
  });

  it("applies a value fix to every row", () => {
    const result = plan([row({ "diamond.shape": "Rnd" }), row({ code: "D-5002", "diamond.shape": "RND", "diamond.certificateNumber": "B" })], {
      mode: "create",
      categoryKey: "Diamond",
      valueFixes: { "diamond.shape": { rnd: "Round" } },
    });
    expect(result.summary).toMatchObject({ create: 2, error: 0 });
    expect(result.rows.map((r) => r.values["diamond.shape"])).toEqual(["Round", "Round"]);
  });

  it("updates in upsert mode, leaving blank cells at the item's current value", () => {
    const existing = mockInventory.find((i) => i.code === "D-1042")!;
    const cells = mapping.map((key) => (key === "code" ? "D-1042" : key === "askingPrice" ? "9,999" : ""));
    const result = buildImportPlan([cells], mapping, { mode: "upsert", categoryKey: "Diamond" }, context());
    expect(result.rows[0]).toMatchObject({ action: "update", existingId: "D-1042" });
    expect(result.rows[0].values.askingPrice).toBe(9999);
    expect(result.rows[0].values["diamond.caratWeight"]).toBe(existing.diamond!.caratWeight);
    expect(result.missingRequired).toEqual([]);
  });

  it("flags required fields that no column supplies", () => {
    const narrow = ["code", "title"];
    const result = buildImportPlan([["", "Loose stone"]], narrow, { mode: "create", categoryKey: "Diamond" }, context());
    expect(result.missingRequired).toEqual([{ categoryKey: "Diamond", labels: ["Shape", "Carat", "Cost", "Asking price"] }]);
    expect(result.rows[0].action).toBe("error");
  });

  it("routes rows by a category column and rejects unknown categories", () => {
    const mixed = [CATEGORY_COLUMN, "title", "watch.brand", "watch.referenceNumber", "watch.serialNumber", "watch.conditionGrade", "cost", "askingPrice"];
    const result = buildImportPlan(
      [
        ["watches", "Sub", "rolex", "126610LN", "SN-1", "Unworn", "9000", "12000"],
        ["Handbags", "Kelly", "", "", "", "", "1", "2"],
      ],
      mixed,
      { mode: "create" },
      context()
    );
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ action: "create", categoryKey: "Watch", code: "W-3042" });
    expect(result.rows[1].errors[0].message).toBe('Unknown category "Handbags"');
  });
});

describe("buildWorkbookPlan", () => {
  it("numbers and de-duplicates across sheets of the same category", async () => {
    const { buildWorkbookPlan } = await import("@/lib/inventory/importPlan");
    const mapping = ["code", "title", "diamond.shape", "diamond.caratWeight", "diamond.certificateNumber", "cost", "askingPrice"];
    const stone = (cert: string) => ["", "Stone", "Round", "1", cert, "1", "2"];
    const result = buildWorkbookPlan(
      [
        { sheetName: "Rounds", dataRows: [stone("X1")], mapping, categoryKey: "Diamond" },
        { sheetName: "Fancies", dataRows: [stone("X2"), stone("x1")], mapping, categoryKey: "Diamond" },
      ],
      { mode: "create" },
      context()
    );
    expect(result.rows.map((r) => [r.sheetName, r.code])).toEqual([
      ["Rounds", "D-1151"],
      ["Fancies", "D-1152"],
      ["Fancies", "D-1153"],
    ]);
    expect(result.rows[2].errors).toEqual([{ fieldKey: "diamond.certificateNumber", message: 'Certificate # "x1" is also on Rounds row 2' }]);
  });
});

describe("guessCategory", () => {
  it("picks the category whose own fields the headers name, and refuses to guess on no evidence", async () => {
    const { guessCategory } = await import("@/lib/inventory/importPlan");
    const fieldsFor = (key: string) => fieldsForCategory(state, key);
    expect(guessCategory(["Stock #", "Carat", "Clarity", "Price"], BUILT_IN_CATEGORIES, fieldsFor)).toBe("Diamond");
    expect(guessCategory(["Brand", "Reference", "Serial"], BUILT_IN_CATEGORIES, fieldsFor)).toBe("Watch");
    expect(guessCategory(["Stock #", "Name", "Price"], BUILT_IN_CATEGORIES, fieldsFor)).toBeUndefined();
  });
});
