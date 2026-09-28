import { beforeEach, describe, expect, it } from "vitest";
import { mockInventory } from "@/data/mockInventory";
import { BUILT_IN_CATEGORIES } from "@/lib/inventory/builtInFields";
import { SECTION_ORDER, applyValues, copyableValues, fieldSuggestions, fieldsForSection, fieldsInSections, itemToValues, validateForm, visibleFields, withTypedDefaults } from "@/lib/inventory/catalogForm";
import { fieldsForCategory, optionsForField, type CatalogState, type OptionLookups } from "@/lib/inventory/registry";
import { getList } from "@/lib/store/masterDataStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import type { FieldDefinition, FieldValue } from "@/types/catalog";
import type { InventoryItem } from "@/types/inventory";
import type { MasterListKey } from "@/types/masterData";

const state: CatalogState = { categories: BUILT_IN_CATEGORIES, overrides: {}, tenantFields: [], customFields: [], enabledPacks: [] };
const lookups: OptionLookups = { getList: (key) => getList(key as MasterListKey), locationPaths: () => ["New York › Receiving", "New York › Vault A"] };
const category = (key: string) => BUILT_IN_CATEGORIES.find((c) => c.key === key);
const optionsFor = (categoryKey: string) => (f: FieldDefinition, resolved: Record<string, FieldValue>) => optionsForField(f, resolved, category(categoryKey), lookups);

const item = (code: string) => structuredClone(mockInventory.find((i) => i.code === code)!) as InventoryItem;

beforeEach(() => {
  installMemoryStorage();
});

describe("section layout", () => {
  it("puts identity first and pricing last", () => {
    expect(SECTION_ORDER[0]).toBe("identity");
    expect(SECTION_ORDER[SECTION_ORDER.length - 1]).toBe("pricing");
  });

  it("covers every section a built-in field can land in, so nothing falls off the form", () => {
    const everySection = new Set(BUILT_IN_CATEGORIES.flatMap((c) => fieldsForCategory(state, c.key)).map((f) => f.section));
    for (const section of everySection) expect(SECTION_ORDER).toContain(section);
  });

  it("files each field under the section it declares", () => {
    const fields = fieldsForCategory(state, "Diamond");
    expect(fieldsForSection(fields, "identity").map((f) => f.key)).toContain("code");
    expect(fieldsForSection(fields, "specification").map((f) => f.key)).toContain("diamond.caratWeight");
    expect(fieldsForSection(fields, "certificate").map((f) => f.key)).toContain("diamond.certificateNumber");
    expect(fieldsForSection(fields, "pricing").map((f) => f.key)).toEqual(expect.arrayContaining(["cost", "askingPrice", "diamond.rapPricePerCarat"]));
  });

  it("partitions fields across sections without loss or duplication", () => {
    const fields = fieldsForCategory(state, "Diamond");
    const partitioned = SECTION_ORDER.flatMap((s) => fieldsForSection(fields, s));
    expect(partitioned).toHaveLength(fields.length);
    expect(new Set(partitioned.map((f) => f.key)).size).toBe(fields.length);
  });

  it("collects several sections at once for the summary rail", () => {
    const fields = fieldsForCategory(state, "Diamond");
    const spec = fieldsInSections(fields, ["specification", "certificate"]).map((f) => f.key);
    expect(spec).toEqual(expect.arrayContaining(["diamond.caratWeight", "diamond.certificateNumber"]));
    expect(spec).not.toContain("cost");
  });

  it("shows Pieces only for lot and quantity stock", () => {
    const fields = fieldsForCategory(state, "Diamond");
    expect(visibleFields(fields, { identityModel: "UNIQUE" }).some((f) => f.key === "quantity")).toBe(false);
    expect(visibleFields(fields, { identityModel: "LOT" }).some((f) => f.key === "quantity")).toBe(true);
  });
});

describe("identity model options", () => {
  it("offers only the models the category allows", () => {
    const identity = fieldsForCategory(state, "Watch").find((f) => f.key === "identityModel")!;
    expect(optionsForField(identity, {}, category("Watch"), lookups)).toEqual(["UNIQUE"]);
  });
});

describe("round trip", () => {
  it("reads an item into values and writes them back unchanged", () => {
    const original = item("D-1042");
    const fields = fieldsForCategory(state, "Diamond");
    const raw = itemToValues(original, fields);
    const validation = validateForm(fields, raw, optionsFor("Diamond"), "MDY", raw);
    expect(validation.errors).toEqual({});
    const written = applyValues(original, fields, raw, validation.values);
    expect(written.diamond).toEqual(original.diamond);
    expect(written.askingPrice).toBe(original.askingPrice);
  });

  it("never erases data held in a field the tenant switched off", () => {
    const original = item("D-1042");
    const withoutGirdle = fieldsForCategory({ ...state, overrides: { "diamond.girdle": { active: false } } }, "Diamond");
    const raw = itemToValues(original, withoutGirdle);
    const validation = validateForm(withoutGirdle, raw, optionsFor("Diamond"), "MDY", raw);
    const written = applyValues(original, withoutGirdle, raw, validation.values);
    expect(written.diamond?.girdle).toBe(original.diamond?.girdle);
  });

  it("keeps data the form never shows (holds, distribution channels)", () => {
    const original = item("D-1042");
    const fields = fieldsForCategory(state, "Diamond");
    const raw = { ...itemToValues(original, fields), askingPrice: 99 };
    const validation = validateForm(fields, raw, optionsFor("Diamond"), "MDY", itemToValues(original, fields));
    const written = applyValues(original, fields, raw, validation.values);
    expect(written.diamond?.channels).toEqual(original.diamond?.channels);
    expect(written.askingPrice).toBe(99);
  });

  it("clears Pieces when a lot becomes unique", () => {
    const fields = fieldsForCategory(state, "Diamond");
    const raw = { identityModel: "UNIQUE", quantity: 12 };
    const written = applyValues({ quantity: 12 } as Partial<InventoryItem>, fields, raw, { identityModel: "UNIQUE", quantity: 12 });
    expect(written.quantity).toBeUndefined();
  });
});

describe("validateForm in edit mode", () => {
  const fields = fieldsForCategory(state, "Diamond");

  it("flags an untouched legacy value as a warning and keeps it", () => {
    const original = { "diamond.cut": "Ideal-ish" };
    const result = validateForm(fields.filter((f) => f.key === "diamond.cut"), original, optionsFor("Diamond"), "MDY", original);
    expect(result.errors).toEqual({});
    expect(result.warnings["diamond.cut"]).toContain("kept as entered");
    expect(result.values["diamond.cut"]).toBe("Ideal-ish");
  });

  it("blocks the same bad value once the user types it", () => {
    const result = validateForm(fields.filter((f) => f.key === "diamond.cut"), { "diamond.cut": "Ideal-ish" }, optionsFor("Diamond"), "MDY", { "diamond.cut": "Excellent" });
    expect(result.errors["diamond.cut"]).toBeDefined();
  });

  it("blocks everything on a new item", () => {
    const result = validateForm(fields.filter((f) => f.key === "diamond.cut"), { "diamond.cut": "Ideal-ish" }, optionsFor("Diamond"), "MDY");
    expect(result.errors["diamond.cut"]).toBeDefined();
  });
});

describe("withTypedDefaults", () => {
  it("fills required typed members without overwriting entered ones", () => {
    const draft = withTypedDefaults("Diamond", { diamond: { caratWeight: 1.2, isLabGrown: undefined } as never });
    expect(draft.diamond).toMatchObject({ caratWeight: 1.2, isLabGrown: false, certificateNumber: "", shape: "" });
  });

  it("leaves tenant categories alone", () => {
    expect(withTypedDefaults("GoldCoins", { title: "x" })).toEqual({ title: "x" });
  });
});

describe("fieldSuggestions", () => {
  it("prices a diamond from Rap, weight and discount", () => {
    const suggestions = fieldSuggestions("Diamond", { "diamond.rapPricePerCarat": 10000, "diamond.caratWeight": 1.01, "diamond.rapDiscountPct": -25 });
    expect(suggestions).toEqual([{ fieldKey: "askingPrice", value: 7575, basis: "Rap 10000/ct × 1.01 ct at -25%" }]);
  });

  it("prices from cost and markup", () => {
    expect(fieldSuggestions("Watch", { cost: 10000, "watch.markupPct": 35 })).toEqual([{ fieldKey: "askingPrice", value: 13500, basis: "Cost + 35% markup" }]);
  });

  it("totals diamond and gem weights from the bill of materials, ignoring metal rows", () => {
    const components = [
      { id: "1", type: "Diamond", quantity: 1, weightCarats: 1.21, isCenter: true },
      { id: "2", type: "Diamond", quantity: 16, weightCarats: 0.21, isCenter: false },
      { id: "3", type: "Sapphire", quantity: 2, weightCarats: 0.5, isCenter: false },
      { id: "4", type: "Metal", quantity: 1, weightCarats: 3, isCenter: false },
    ];
    const suggestions = fieldSuggestions("Jewelry", {}, components);
    expect(suggestions).toEqual([
      { fieldKey: "jewelry.totalDiamondCarats", value: 1.42, basis: "Sum of diamond rows in the bill of materials" },
      { fieldKey: "jewelry.totalGemCarats", value: 0.5, basis: "Sum of gemstone rows in the bill of materials" },
    ]);
  });

  it("stays quiet when the value already matches", () => {
    expect(fieldSuggestions("Watch", { cost: 100, "watch.markupPct": 50, askingPrice: 150 })).toEqual([]);
  });
});

describe("copyableValues", () => {
  it("copies specification but never unique identifiers or the name", () => {
    const fields = fieldsForCategory(state, "Diamond");
    const copy = copyableValues(fields, { code: "D-1", title: "Stone", "diamond.certificateNumber": "GIA 1", "diamond.shape": "Round", location: "Vault" });
    expect(copy).toEqual({ "diamond.shape": "Round", location: "Vault" });
  });
});
