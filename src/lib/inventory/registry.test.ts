import { beforeEach, describe, expect, it } from "vitest";
import { mockInventory } from "@/data/mockInventory";
import { BUILT_IN_CATEGORIES, BUILT_IN_FIELDS } from "@/lib/inventory/builtInFields";
import { getPath, validateValues } from "@/lib/inventory/fieldValues";
import { applyOverride, customFieldToDefinition, fieldsForCategory, headerLookup, resolveOptions, type CatalogState, type OptionLookups } from "@/lib/inventory/registry";
import { getList } from "@/lib/store/masterDataStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import type { FieldValue } from "@/types/catalog";
import { MASTER_LISTS, type MasterListKey } from "@/types/masterData";

const state = (over: Partial<CatalogState> = {}): CatalogState => ({
  categories: BUILT_IN_CATEGORIES,
  overrides: {},
  tenantFields: [],
  customFields: [],
  enabledPacks: [],
  ...over,
});

const lookups: OptionLookups = { getList: (key) => getList(key as MasterListKey), locationPaths: () => [] };

beforeEach(() => {
  installMemoryStorage();
});

describe("built-in catalog integrity", () => {
  it("has unique field keys", () => {
    const keys = BUILT_IN_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only references master lists that exist", () => {
    const known = new Set(MASTER_LISTS.map((l) => l.key as string));
    const missing = BUILT_IN_FIELDS.filter((f) => f.source?.kind === "masterList" && !known.has(f.source.key)).map((f) => f.key);
    expect(missing).toEqual([]);
  });

  it("scopes lists only by fields that exist", () => {
    const keys = new Set(BUILT_IN_FIELDS.map((f) => f.key));
    for (const f of BUILT_IN_FIELDS) {
      if (f.source?.kind === "masterList" && f.source.scopedByField) expect(keys.has(f.source.scopedByField)).toBe(true);
    }
  });

  it("puts every market-pack field in the attribute bag", () => {
    for (const f of BUILT_IN_FIELDS.filter((f) => f.pack)) expect(f.path.startsWith("attributes.")).toBe(true);
  });

  it.each(BUILT_IN_CATEGORIES.map((c) => c.key))("maps every import header in %s to exactly one field", (categoryKey) => {
    const { conflicts } = headerLookup(fieldsForCategory(state({ enabledPacks: ["IN"] }), categoryKey));
    expect(conflicts).toEqual([]);
  });
});

describe("fieldsForCategory", () => {
  it("combines common and category fields, identity first and pricing after specification", () => {
    const fields = fieldsForCategory(state(), "Diamond");
    const keys = fields.map((f) => f.key);
    expect(keys[0]).toBe("code");
    expect(keys).toContain("diamond.caratWeight");
    expect(keys).not.toContain("watch.brand");
    expect(keys.indexOf("diamond.caratWeight")).toBeLessThan(keys.indexOf("askingPrice"));
  });

  it("shows market-pack fields only while the pack is enabled", () => {
    expect(fieldsForCategory(state(), "Jewelry").some((f) => f.key === "in.huid")).toBe(false);
    expect(fieldsForCategory(state({ enabledPacks: ["IN"] }), "Jewelry").some((f) => f.key === "in.huid")).toBe(true);
  });

  it("gives a tenant category the common fields plus its own", () => {
    const tenantField = { ...customFieldToDefinition({ id: "x", tenantId: "t", label: "x", type: "text", appliesTo: "All", required: false, active: true, sortOrder: 0 }) };
    const fields = fieldsForCategory(state({ tenantFields: [{ ...tenantField, key: "t.purity", path: "attributes.purity", categories: ["SilverArticles"], origin: "tenant" }] }), "SilverArticles");
    expect(fields.map((f) => f.key)).toEqual(expect.arrayContaining(["code", "title", "askingPrice", "t.purity"]));
    expect(fields.some((f) => f.key.startsWith("diamond."))).toBe(false);
  });

  it("hides deactivated fields and applies relabels", () => {
    const fields = fieldsForCategory(state({ overrides: { "diamond.culet": { active: false }, "diamond.caratWeight": { label: "Weight (ct)" } } }), "Diamond");
    expect(fields.some((f) => f.key === "diamond.culet")).toBe(false);
    expect(fields.find((f) => f.key === "diamond.caratWeight")?.label).toBe("Weight (ct)");
  });
});

describe("applyOverride", () => {
  const code = BUILT_IN_FIELDS.find((f) => f.key === "code")!;
  const huid = BUILT_IN_FIELDS.find((f) => f.key === "in.huid")!;
  const carat = BUILT_IN_FIELDS.find((f) => f.key === "diamond.caratWeight")!;

  it("never lets a system field be switched off or made optional", () => {
    const next = applyOverride(code, { active: false, required: false, label: "SKU" });
    expect(next).toMatchObject({ active: true, required: true, label: "SKU" });
  });

  it("lets pack fields extend to tenant categories", () => {
    expect(applyOverride(huid, { categories: ["Jewelry", "GoldCoins"] }).categories).toEqual(["Jewelry", "GoldCoins"]);
  });

  it("refuses to move a typed-block field onto other categories", () => {
    expect(applyOverride(carat, { categories: ["Watch"] }).categories).toEqual(["Diamond"]);
  });
});

describe("customFieldToDefinition", () => {
  it("keeps stored values where they are and maps dropdowns to selects", () => {
    const definition = customFieldToDefinition({ id: "cf-2", tenantId: "t", label: "Origin", type: "dropdown", options: ["Botswana"], appliesTo: "Diamond", required: true, active: true, sortOrder: 3 });
    expect(definition).toMatchObject({ key: "custom.cf-2", path: "customFields.cf-2", type: "select", categories: ["Diamond"], source: { kind: "options", values: ["Botswana"] } });
  });
});

describe("resolveOptions", () => {
  const karat = BUILT_IN_FIELDS.find((f) => f.key === "jewelry.metalKarat")!;

  it("filters a scoped list by its parent's value", () => {
    expect(resolveOptions(karat, { "jewelry.metalType": "Platinum" }, lookups)).toEqual(["950 Platinum", "900 Platinum"]);
  });

  it("offers nothing until the parent is chosen", () => {
    expect(resolveOptions(karat, {}, lookups)).toEqual([]);
  });
});

describe("seed inventory against the catalog", () => {
  // Location is excluded: it holds custody text like "With Harbor Jewelers" while on memo, not a tree path.
  it.each(mockInventory.map((item) => [item.code, item] as const))("%s passes validation", (_code, item) => {
    const fields = fieldsForCategory(state(), item.category).filter((f) => f.key !== "location");
    const raw: Record<string, unknown> = {};
    for (const f of fields) raw[f.key] = getPath(item, f.path);
    const outcome = validateValues(fields, raw, (f, resolved: Record<string, FieldValue>) => resolveOptions(f, resolved, lookups), "MDY");
    expect(outcome.errors).toEqual({});
  });
});
