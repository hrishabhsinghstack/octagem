import { getPath, isBlank, setPath, unsetPath, validateValues, type DateOrder } from "@/lib/inventory/fieldValues";
import { isFieldVisible } from "@/lib/inventory/registry";
import type { FieldDefinition, FieldSection, FieldValue } from "@/types/catalog";
import type { DiamondAttributes, InventoryItem, JewelryAttributes, JewelryComponent, WatchAttributes } from "@/types/inventory";

/**
 * The catalog-driven intake form's logic, kept out of React so it is testable: item ⇄ form values,
 * validation, and pricing suggestions. The form component only renders and wires state.
 */

export type RawValues = Record<string, unknown>;

/**
 * The order sections are laid out down the form: what the piece *is*, then what it *is*
 * specifically, then what it costs. The form is one page — this replaced a three-step wizard, whose
 * steps hid errors in sections the user had not opened yet and cost two clicks per item on the most
 * repeated task in the product.
 */
export const SECTION_ORDER: FieldSection[] = ["identity", "specification", "certificate", "components", "market", "custom", "pricing"];

export function fieldsForSection(fields: FieldDefinition[], section: FieldSection): FieldDefinition[] {
  return fields.filter((f) => f.section === section);
}

/** Fields in any of the given sections, in SECTION_ORDER — used for the summary rail and section grouping. */
export function fieldsInSections(fields: FieldDefinition[], sections: FieldSection[]): FieldDefinition[] {
  return fields.filter((f) => sections.includes(f.section));
}

export function visibleFields(fields: FieldDefinition[], values: RawValues): FieldDefinition[] {
  return fields.filter((f) => isFieldVisible(f, values));
}

/** Current values of an item, keyed by field key — what the edit form starts from. */
export function itemToValues(item: InventoryItem, fields: FieldDefinition[]): RawValues {
  const values: RawValues = {};
  for (const field of fields) {
    const value = getPath(item, field.path);
    if (!isBlank(value)) values[field.key] = value;
  }
  return values;
}

export interface FormValidation {
  values: Record<string, FieldValue>;
  errors: Record<string, string>;
  /** Problems with values the user did not touch on an existing item — shown, never blocking. */
  warnings: Record<string, string>;
  suggestions: Record<string, string>;
}

/** Whether a value is what it was — unchanged history never blocks a save (see validateForm). */
export function sameRaw(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Validates the visible fields. With `original` (edit mode), a value the user left unchanged is
 * never blocking: an item saved under the old free-text form may hold "Very good" where the list now
 * says "Very Good", or lack a field made required since. Refusing to save a price change over that
 * would punish the user for history; it is kept as entered and flagged instead.
 */
export function validateForm(
  fields: FieldDefinition[],
  raw: RawValues,
  optionsFor: (field: FieldDefinition, resolved: Record<string, FieldValue>) => string[] | undefined,
  dateOrder: DateOrder,
  original?: RawValues
): FormValidation {
  const visible = visibleFields(fields, raw);
  const outcome = validateValues(visible, raw, optionsFor, dateOrder);
  const result: FormValidation = { values: outcome.values, errors: {}, warnings: {}, suggestions: outcome.suggestions };
  for (const [key, message] of Object.entries(outcome.errors)) {
    if (original && sameRaw(original[key], raw[key])) {
      result.warnings[key] = isBlank(raw[key]) ? message : `${message} — kept as entered`;
      if (!isBlank(original[key])) result.values[key] = original[key] as FieldValue;
    } else {
      result.errors[key] = message;
    }
  }
  return result;
}

/**
 * Writes validated values onto a copy of `base`. Fields hidden by `visibleWhen` are cleared (Pieces
 * on a unique stone); fields not in `fields` at all — deactivated by the tenant — are left exactly
 * as they were, so switching a field off never erases data.
 */
export function applyValues<T extends object>(base: T, fields: FieldDefinition[], raw: RawValues, values: Record<string, FieldValue>): T {
  let next = base;
  for (const field of fields) {
    const value = isFieldVisible(field, raw) ? values[field.key] : undefined;
    next = value === undefined ? unsetPath(next, field.path) : setPath(next, field.path, value);
  }
  return next;
}

function mergeDefined<T extends object>(defaults: T, value: Partial<T> | undefined): T {
  const merged = { ...defaults } as Record<string, unknown>;
  for (const [key, v] of Object.entries(value ?? {})) if (v !== undefined) merged[key] = v;
  return merged as T;
}

/** Built-in categories store typed blocks whose required members must exist even when left blank. */
export function withTypedDefaults(category: string, draft: Partial<InventoryItem>): Partial<InventoryItem> {
  if (category === "Diamond") {
    return { ...draft, diamond: mergeDefined<DiamondAttributes>({ shape: "", caratWeight: 0, color: "", clarity: "", lab: "", certificateNumber: "", isLabGrown: false }, draft.diamond) };
  }
  if (category === "Jewelry") {
    return { ...draft, jewelry: mergeDefined<JewelryAttributes>({ styleNumber: "", metalType: "", grossWeightGrams: 0, components: [] }, draft.jewelry) };
  }
  if (category === "Watch") {
    return {
      ...draft,
      watch: mergeDefined<WatchAttributes>({ brand: "", referenceNumber: "", serialNumber: "", hasBox: false, hasPapers: false, conditionGrade: "Excellent" }, draft.watch),
    };
  }
  return draft;
}

/* ---------------------------------------------------------------- suggestions */

export interface FieldSuggestion {
  fieldKey: string;
  value: number;
  /** How the number was derived, shown next to the "Use" action. */
  basis: string;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/** Non-gem BOM rows that carry no carat weight worth totalling. */
const NON_STONE_TYPES = new Set(["metal", "finding"]);

/**
 * Derived numbers the user can accept with one click — never written automatically, since a dealer's
 * asking price is a decision, not a formula. Suggestions equal to the current value are omitted.
 */
export function fieldSuggestions(category: string, values: Record<string, FieldValue>, components: JewelryComponent[] = [], formatMoney: (n: number) => string = String): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = [];
  const push = (fieldKey: string, value: number, basis: string) => {
    if (Number.isFinite(value) && value > 0 && num(values[fieldKey]) !== value) suggestions.push({ fieldKey, value, basis });
  };

  if (category === "Diamond") {
    const rap = num(values["diamond.rapPricePerCarat"]);
    const carat = num(values["diamond.caratWeight"]);
    const discount = num(values["diamond.rapDiscountPct"]) ?? 0;
    if (rap && carat) {
      push("askingPrice", round(rap * carat * (1 + discount / 100), 2), `Rap ${formatMoney(rap)}/ct × ${carat} ct${discount ? ` at ${discount > 0 ? "+" : ""}${discount}%` : ""}`);
    }
  }

  const markup = num(values["jewelry.markupPct"]) ?? num(values["watch.markupPct"]);
  const cost = num(values.cost);
  if (markup !== undefined && cost) push("askingPrice", round(cost * (1 + markup / 100), 2), `Cost + ${markup}% markup`);

  if (category === "Jewelry" && components.length > 0) {
    const weigh = (predicate: (c: JewelryComponent) => boolean) =>
      round(
        components.filter(predicate).reduce((sum, c) => sum + (c.weightCarats ?? 0), 0),
        3
      );
    const isDiamond = (c: JewelryComponent) => c.type.toLowerCase() === "diamond";
    push("jewelry.totalDiamondCarats", weigh(isDiamond), "Sum of diamond rows in the bill of materials");
    push("jewelry.totalGemCarats", weigh((c) => !isDiamond(c) && !NON_STONE_TYPES.has(c.type.toLowerCase())), "Sum of gemstone rows in the bill of materials");
  }

  return suggestions;
}

/** Values carried into the next item on "Save & add another" — the batch context, not the item's identity. */
export const CARRY_FORWARD_KEYS = ["identityModel", "location"];

/**
 * "Copy from last item": everything except identifiers that must be unique and the name, which is
 * per piece. The caller supplies a fresh stock number.
 */
export function copyableValues(fields: FieldDefinition[], values: RawValues): RawValues {
  const copy: RawValues = {};
  for (const field of fields) {
    if (field.unique || field.key === "title") continue;
    if (!isBlank(values[field.key])) copy[field.key] = values[field.key];
  }
  return copy;
}
