import { describe, expect, it } from "vitest";
import {
  coerceValue,
  findUniqueConflicts,
  getPath,
  matchOption,
  normaliseToken,
  parseBoolean,
  parseDate,
  parseNumber,
  setPath,
  suggestOption,
  unsetPath,
  validateValues,
} from "@/lib/inventory/fieldValues";
import type { FieldDefinition } from "@/types/catalog";
import type { InventoryItem } from "@/types/inventory";

const field = (over: Partial<FieldDefinition>): FieldDefinition => ({
  key: "f",
  label: "Field",
  type: "text",
  section: "specification",
  path: "attributes.f",
  categories: "All",
  required: false,
  active: true,
  sortOrder: 0,
  origin: "builtIn",
  ...over,
});

const MDY = { dateOrder: "MDY" as const };

describe("parseNumber", () => {
  it.each([
    ["1234", 1234],
    ["1,234,567.50", 1234567.5],
    ["12,34,567", 1234567], // Indian grouping
    ["$5,800", 5800],
    ["₹ 1,25,000", 125000],
    ["Rs. 500", 500],
    ["USD 42", 42],
    ["(1,200)", -1200],
    ["-$500", -500],
    ["1.52 ct", 1.52],
    ["4.5cts", 4.5],
    ["-25%", -25],
    [".75", 0.75],
    [3.2, 3.2],
  ])("parses %j as %d", (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it.each(["", "abc", "1.2.3", "12-34", "--5", Number.NaN, null])("rejects %j", (raw) => {
    expect(parseNumber(raw)).toBeNull();
  });
});

describe("parseBoolean", () => {
  it.each([
    ["Yes", true],
    ["y", true],
    ["TRUE", true],
    ["1", true],
    [1, true],
    ["No", false],
    ["n", false],
    [0, false],
    [false, false],
  ])("reads %j as %s", (raw, expected) => {
    expect(parseBoolean(raw)).toBe(expected);
  });

  it("rejects anything else rather than guessing", () => {
    expect(parseBoolean("maybe")).toBeNull();
    expect(parseBoolean(2)).toBeNull();
  });
});

describe("parseDate", () => {
  it("reads ISO and year-first dates regardless of order", () => {
    expect(parseDate("2026-03-04", "DMY")).toBe("2026-03-04");
    expect(parseDate("2026/3/4", "MDY")).toBe("2026-03-04");
  });

  it("reads ambiguous slash dates by the tenant's order", () => {
    expect(parseDate("03/04/2026", "MDY")).toBe("2026-03-04");
    expect(parseDate("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(parseDate("25.12.2026", "DMY")).toBe("2026-12-25");
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(parseDate("31/02/2026", "DMY")).toBeNull();
    expect(parseDate("13/25/2026", "MDY")).toBeNull();
    expect(parseDate("2026-02-29", "DMY")).toBeNull();
    expect(parseDate("2028-02-29", "DMY")).toBe("2028-02-29");
  });

  it("reads spreadsheet Date cells by their UTC calendar day", () => {
    expect(parseDate(new Date(Date.UTC(2026, 2, 4)), "MDY")).toBe("2026-03-04");
  });

  it("reads Excel serial day numbers", () => {
    expect(parseDate(45658, "MDY")).toBe("2025-01-01");
    expect(parseDate(1.5, "MDY")).toBeNull();
  });

  it("rejects free text", () => {
    expect(parseDate("next Tuesday", "MDY")).toBeNull();
  });
});

describe("matchOption", () => {
  const clarities = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "SI"];
  const labs = ["GIA", "IGI", "None"];

  it("returns the canonical spelling for case and separator variants", () => {
    expect(matchOption("vs 1", clarities)).toEqual({ ok: true, value: "VS1" });
    expect(matchOption("VS-1", clarities)).toEqual({ ok: true, value: "VS1" });
    expect(matchOption(" gia ", labs)).toEqual({ ok: true, value: "GIA" });
  });

  it("maps spellings of 'nothing' to the list's None entry", () => {
    for (const raw of ["N/A", "na", "-", "nil", "none"]) expect(matchOption(raw, labs)).toEqual({ ok: true, value: "None" });
  });

  it("does not invent a None the list does not have", () => {
    expect(matchOption("N/A", ["GIA"]).ok).toBe(false);
  });

  it("accepts ranges only when allowed and both ends are valid", () => {
    const colors = "DEFGHIJK".split("");
    expect(matchOption("g-h", colors, true)).toEqual({ ok: true, value: "G-H" });
    expect(matchOption("G – H", colors, true)).toEqual({ ok: true, value: "G-H" });
    expect(matchOption("SI1 to SI2", clarities, true)).toEqual({ ok: true, value: "SI1-SI2" });
    expect(matchOption("G-H", colors, false).ok).toBe(false);
    expect(matchOption("G-Q", colors, true).ok).toBe(false);
    expect(matchOption("G-G", colors, true).ok).toBe(false);
  });

  it("suggests a close option on a typo", () => {
    const result = matchOption("Excelent", ["Excellent", "Very Good", "Good"]);
    expect(result).toMatchObject({ ok: false, suggestion: "Excellent" });
  });
});

describe("suggestOption", () => {
  it("offers nothing when no option is plausibly close", () => {
    expect(suggestOption("Zircon", ["Round", "Oval"])).toBeUndefined();
  });

  it("recognises dealer abbreviations", () => {
    expect(suggestOption("Rnd", ["Round", "Oval"])).toBe("Round");
    expect(suggestOption("Prn", ["Princess", "Pear"])).toBe("Princess");
    expect(suggestOption("Rn", ["Round"])).toBeUndefined();
  });

  it("prefers prefix matches", () => {
    expect(suggestOption("Cush", ["Round", "Cushion"])).toBe("Cushion");
  });
});

describe("coerceValue", () => {
  it("treats blank as no value", () => {
    expect(coerceValue(field({ type: "number" }), "  ", MDY)).toEqual({ ok: true, value: undefined });
  });

  it("rejects extra decimals rather than silently rounding a weight", () => {
    const carat = field({ type: "number", decimals: 3, min: 0.001 });
    expect(coerceValue(carat, "1.505", MDY)).toEqual({ ok: true, value: 1.505 });
    expect(coerceValue(carat, "1.5051", MDY)).toMatchObject({ ok: false, error: "At most 3 decimal places" });
    expect(coerceValue(carat, "0", MDY)).toMatchObject({ ok: false, error: "Must be at least 0.001" });
  });

  it("enforces whole numbers for integer fields", () => {
    expect(coerceValue(field({ type: "integer" }), "2019", MDY)).toEqual({ ok: true, value: 2019 });
    expect(coerceValue(field({ type: "integer" }), "2019.5", MDY)).toMatchObject({ ok: false });
  });

  it("upper-cases before checking a pattern", () => {
    const huid = field({ uppercase: true, pattern: { regex: "^[A-Z0-9]{6}$", message: "6 chars" } });
    expect(coerceValue(huid, "ab12cd", MDY)).toEqual({ ok: true, value: "AB12CD" });
    expect(coerceValue(huid, "AB12C", MDY)).toEqual({ ok: false, error: "6 chars" });
  });

  it("collapses internal whitespace in text", () => {
    expect(coerceValue(field({}), "  Halo   ring ", MDY)).toEqual({ ok: true, value: "Halo ring" });
  });

  it("splits, matches and de-duplicates multiselect values", () => {
    const features = field({ type: "multiselect" });
    const options = ["Chronograph", "GMT", "Date"];
    expect(coerceValue(features, "gmt; Chronograph, GMT", { ...MDY, options })).toEqual({ ok: true, value: ["GMT", "Chronograph"] });
    expect(coerceValue(features, "GMT, Tourbillon", { ...MDY, options })).toMatchObject({ ok: false });
  });
});

describe("validateValues", () => {
  const metal = field({ key: "metal", label: "Metal", type: "select", required: true, source: { kind: "masterList", key: "metalTypes" } });
  const karat = field({ key: "karat", label: "Karat", type: "select", source: { kind: "masterList", key: "metalKarats", scopedByField: "metal" } });
  const karats: Record<string, string[]> = { Gold: ["18K", "14K"], Platinum: ["950 Platinum"] };
  const optionsFor = (f: FieldDefinition, resolved: Record<string, unknown>) =>
    f.key === "metal" ? ["Gold", "Platinum"] : karats[String(resolved.metal)] ?? [];

  it("resolves scoped lists after their parent, whatever the field order", () => {
    const outcome = validateValues([karat, metal], { metal: "gold", karat: "18k" }, optionsFor, "MDY");
    expect(outcome.errors).toEqual({});
    expect(outcome.values).toEqual({ metal: "Gold", karat: "18K" });
  });

  it("rejects a karat that does not belong to the chosen metal", () => {
    const outcome = validateValues([metal, karat], { metal: "Platinum", karat: "18K" }, optionsFor, "MDY");
    expect(outcome.errors.karat).toBeDefined();
  });

  it("reports missing required fields by label", () => {
    const outcome = validateValues([metal], {}, optionsFor, "MDY");
    expect(outcome.errors).toEqual({ metal: "Metal is required" });
  });

  it("carries suggestions for fixable typos", () => {
    const outcome = validateValues([metal], { metal: "Gld" }, optionsFor, "MDY");
    expect(outcome.suggestions.metal).toBe("Gold");
  });
});

describe("getPath / setPath", () => {
  it("reads nested values and tolerates missing branches", () => {
    expect(getPath({ diamond: { fancyColor: { intensity: "Fancy" } } }, "diamond.fancyColor.intensity")).toBe("Fancy");
    expect(getPath({}, "diamond.fancyColor.intensity")).toBeUndefined();
  });

  it("sets immutably, creating intermediate objects", () => {
    const source = { diamond: { shape: "Round" } };
    const next = setPath(source, "diamond.measurements.lengthMm", 6.4);
    expect(next).toEqual({ diamond: { shape: "Round", measurements: { lengthMm: 6.4 } } });
    expect(source).toEqual({ diamond: { shape: "Round" } });
  });
});

describe("unsetPath", () => {
  it("removes the key and prunes parents left empty", () => {
    const source = { diamond: { shape: "Round", fancyColor: { intensity: "Fancy" } } };
    expect(unsetPath(source, "diamond.fancyColor.intensity")).toEqual({ diamond: { shape: "Round" } });
    expect(source.diamond.fancyColor.intensity).toBe("Fancy");
  });

  it("is a no-op for a missing branch", () => {
    const source = { diamond: { shape: "Round" } };
    expect(unsetPath(source, "watch.brand")).toBe(source);
    expect(unsetPath(source, "diamond.measurements.lengthMm")).toBe(source);
  });
});

describe("findUniqueConflicts", () => {
  const cert = field({ key: "cert", label: "Certificate #", path: "diamond.certificateNumber", unique: "live" });
  const code = field({ key: "code", label: "Stock number", path: "code", unique: "always" });
  const item = (id: string, status: InventoryItem["status"], certificateNumber: string) =>
    ({ id, code: id, status, diamond: { certificateNumber } }) as unknown as InventoryItem;
  const items = [item("D-1", "Available", "GIA 2201948532"), item("D-2", "Sold", "GIA 999"), item("D-3", "Available", "N/A")];

  it("flags a clash ignoring case and spacing", () => {
    const conflicts = findUniqueConflicts([cert], { cert: "gia2201948532" }, items);
    expect(conflicts).toEqual([{ fieldKey: "cert", message: 'Certificate # "gia2201948532" is already used by D-1', conflictingItemId: "D-1" }]);
  });

  it("lets a live-unique value return after the earlier item was sold (buy-back)", () => {
    expect(findUniqueConflicts([cert], { cert: "GIA 999" }, items)).toEqual([]);
  });

  it("still blocks always-unique values held by sold items", () => {
    expect(findUniqueConflicts([code], { code: "D-2" }, items)).toHaveLength(1);
  });

  it("never treats 'nothing' values as clashing", () => {
    expect(findUniqueConflicts([cert], { cert: "n/a" }, items)).toEqual([]);
  });

  it("skips the item being edited", () => {
    expect(findUniqueConflicts([cert], { cert: "GIA 2201948532" }, items, "D-1")).toEqual([]);
  });
});

describe("normaliseToken", () => {
  it("ignores case, spaces and separators", () => {
    expect(normaliseToken("Very-Good")).toBe(normaliseToken("very good"));
  });

  it("treats location paths with different separators as the same place", () => {
    expect(matchOption("New York · Vault A · Tray 5", ["New York › Vault A › Tray 5"])).toEqual({ ok: true, value: "New York › Vault A › Tray 5" });
  });
});

describe("open list mode", () => {
  const caseMaterial = field({ type: "select", listMode: "open" });
  const options = ["Stainless Steel", "Yellow Gold"];

  it("still normalises a value that matches the list", () => {
    expect(coerceValue(caseMaterial, "stainless steel", { ...MDY, options })).toEqual({ ok: true, value: "Stainless Steel" });
  });

  it("keeps an unlisted value as typed instead of rejecting it", () => {
    expect(coerceValue(caseMaterial, " Oystersteel  & white gold ", { ...MDY, options })).toEqual({ ok: true, value: "Oystersteel & white gold" });
  });

  it("is strict by default", () => {
    expect(coerceValue(field({ type: "select" }), "Oystersteel", { ...MDY, options }).ok).toBe(false);
  });
});
