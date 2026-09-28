import { allFields, appliesToCategory, fieldsForCategory, type CatalogState, type FieldOverride, type OptionLookups } from "@/lib/inventory/registry";
import { normaliseToken } from "@/lib/inventory/fieldValues";
import { nextStockNumber } from "@/lib/inventory/stockNumber";
import * as store from "@/lib/store/catalogStore";
import * as customFieldStore from "@/lib/store/customFieldStore";
import { getAll as getAllItems } from "@/lib/store/inventoryStore";
import { getList, listLocationPaths } from "@/lib/store/masterDataStore";
import type { CategoryDefinition, FieldDefinition, FieldOptionSource, FieldSection, FieldType, WeightUnit } from "@/types/catalog";
import type { IdentityModel } from "@/types/inventory";
import type { MasterListKey } from "@/types/masterData";

/**
 * Catalog configuration: categories, fields and market settings. Shaped like a future HTTP client
 * (async, validates, throws CatalogError with a user-facing message) so a backend can replace the
 * bodies without touching callers.
 */
export class CatalogError extends Error {}

export async function getCatalog(): Promise<CatalogState> {
  return store.getState();
}

export async function listCategories(activeOnly = true): Promise<CategoryDefinition[]> {
  return store.getCategories(activeOnly);
}

export async function listFieldsForCategory(categoryKey: string): Promise<FieldDefinition[]> {
  return fieldsForCategory(store.getState(), categoryKey);
}

/** Master data and locations, in the shape registry.resolveOptions expects. */
export const optionLookups: OptionLookups = {
  getList: (key) => getList(key as MasterListKey),
  locationPaths: () => listLocationPaths().map((l) => l.path),
};

export async function suggestStockNumber(categoryKey: string): Promise<string> {
  const category = store.getCategory(categoryKey);
  if (!category) throw new CatalogError(`Unknown category "${categoryKey}".`);
  return nextStockNumber(category, getAllItems().map((item) => item.code));
}

/* ---------------------------------------------------------------- categories */

function slug(label: string): string {
  return label
    .trim()
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function assertCategoryUnique(candidate: Pick<CategoryDefinition, "key" | "label" | "stockPrefix">, others: CategoryDefinition[]) {
  const label = normaliseToken(candidate.label);
  const prefix = candidate.stockPrefix.trim().toUpperCase();
  for (const other of others) {
    if (other.key === candidate.key) continue;
    if (normaliseToken(other.label) === label) throw new CatalogError(`A category named "${other.label}" already exists.`);
    // Two categories on one prefix would make auto-numbering hand out the same stock number twice.
    if (other.stockPrefix.trim().toUpperCase() === prefix) throw new CatalogError(`Stock prefix "${prefix}" is already used by ${other.label}.`);
  }
}

function assertPrefix(prefix: string) {
  if (!/^[A-Z0-9][A-Z0-9\-_/.]{0,9}$/i.test(prefix.trim())) throw new CatalogError("Stock prefix must be 1–10 letters, numbers or - _ / . characters.");
}

export interface CreateCategoryPayload {
  label: string;
  stockPrefix: string;
  stockStartNumber?: number;
  stockPadding?: number;
  weightUnit: WeightUnit;
  defaultIdentityModel: IdentityModel;
  allowedIdentityModels?: IdentityModel[];
  icon?: string;
}

export async function createCategory(payload: CreateCategoryPayload): Promise<CategoryDefinition> {
  const label = payload.label.trim();
  if (!label) throw new CatalogError("Category name is required.");
  assertPrefix(payload.stockPrefix);
  const existing = store.getCategories(false);
  const baseKey = slug(label) || "Category";
  let key = baseKey;
  for (let n = 2; existing.some((c) => c.key === key); n++) key = `${baseKey}${n}`;

  const category: CategoryDefinition = {
    key,
    label,
    builtIn: false,
    active: true,
    sortOrder: existing.length,
    icon: payload.icon ?? "package",
    defaultIdentityModel: payload.defaultIdentityModel,
    allowedIdentityModels: payload.allowedIdentityModels?.length ? payload.allowedIdentityModels : [payload.defaultIdentityModel],
    stockPrefix: payload.stockPrefix.trim().toUpperCase(),
    stockStartNumber: payload.stockStartNumber ?? 1,
    stockPadding: payload.stockPadding ?? 0,
    weightUnit: payload.weightUnit,
  };
  if (!category.allowedIdentityModels.includes(category.defaultIdentityModel)) category.allowedIdentityModels.push(category.defaultIdentityModel);
  assertCategoryUnique(category, existing);
  store.upsertCategory(category);
  // A weighed category gets its weight field up front, in its unit — the one spec every piece has.
  if (category.weightUnit !== "none") {
    await createTenantField({
      label: "Weight",
      type: "number",
      categories: [category.key],
      unit: category.weightUnit,
      min: 0,
      decimals: 3,
      aliases: ["weight", "wt", category.weightUnit === "ct" ? "carat" : "grams", category.weightUnit === "ct" ? "carats" : "gross weight"],
    });
  }
  return category;
}

export type UpdateCategoryPayload = Partial<Omit<CategoryDefinition, "key" | "builtIn">>;

export async function updateCategory(key: string, patch: UpdateCategoryPayload): Promise<CategoryDefinition> {
  const current = store.getCategory(key);
  if (!current) throw new CatalogError(`Unknown category "${key}".`);
  const next: CategoryDefinition = { ...current, ...patch, key: current.key, builtIn: current.builtIn };
  if (!next.label.trim()) throw new CatalogError("Category name is required.");
  assertPrefix(next.stockPrefix);
  next.stockPrefix = next.stockPrefix.trim().toUpperCase();
  if (!next.allowedIdentityModels.includes(next.defaultIdentityModel)) throw new CatalogError("The default identity model must be one of the allowed ones.");
  assertCategoryUnique(next, store.getCategories(false));
  return store.upsertCategory(next);
}

/** Deleting is only for mistakes. A category with stock is deactivated instead, so its items keep their meaning. */
export async function deleteCategory(key: string): Promise<void> {
  const category = store.getCategory(key);
  if (!category) return;
  if (category.builtIn) throw new CatalogError(`${category.label} is built in — deactivate it instead.`);
  const inUse = getAllItems().filter((item) => item.category === key).length;
  if (inUse > 0) throw new CatalogError(`${inUse} item${inUse === 1 ? " uses" : "s use"} ${category.label} — deactivate it instead.`);
  store.removeCategory(key);
  // Fields that only belonged to this category would otherwise linger invisibly.
  for (const field of store.getState().tenantFields) {
    if (field.categories !== "All" && field.categories.every((c) => c === key)) store.removeTenantField(field.key);
  }
}

/* ---------------------------------------------------------------- fields */

export interface CreateFieldPayload {
  label: string;
  type: FieldType;
  section?: FieldSection;
  categories: string[] | "All";
  source?: FieldOptionSource;
  required?: boolean;
  unique?: "live";
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  aliases?: string[];
  help?: string;
}

export async function createTenantField(payload: CreateFieldPayload): Promise<FieldDefinition> {
  const label = payload.label.trim();
  if (!label) throw new CatalogError("Field name is required.");
  if ((payload.type === "select" || payload.type === "multiselect") && !payload.source) throw new CatalogError("A dropdown field needs a list of values.");
  if (payload.categories !== "All" && payload.categories.length === 0) throw new CatalogError("Pick at least one category.");

  const state = store.getState();
  const fieldSlug = slug(label).charAt(0).toLowerCase() + slug(label).slice(1);
  const existingKeys = new Set(state.tenantFields.map((f) => f.key));
  let key = `t.${fieldSlug}`;
  for (let n = 2; existingKeys.has(key); n++) key = `t.${fieldSlug}${n}`;

  const scope = payload.categories === "All" ? state.categories.map((c) => c.key) : payload.categories;
  for (const categoryKey of scope) {
    const clash = fieldsForCategory(state, categoryKey).find((f) => normaliseToken(f.label) === normaliseToken(label));
    if (clash) throw new CatalogError(`${categoryKey} already has a field called "${clash.label}".`);
  }

  const field: FieldDefinition = {
    key,
    label,
    type: payload.type,
    section: payload.section ?? "specification",
    path: `attributes.${key.slice(2)}`,
    categories: payload.categories,
    source: payload.source,
    required: payload.required ?? false,
    unique: payload.unique,
    min: payload.min,
    max: payload.max,
    decimals: payload.decimals,
    unit: payload.unit,
    aliases: payload.aliases,
    help: payload.help,
    active: true,
    sortOrder: 1000 + state.tenantFields.length,
    origin: "tenant",
  };
  return store.upsertTenantField(field);
}

export async function setFieldOverride(fieldKey: string, override: FieldOverride): Promise<void> {
  store.setOverride(fieldKey, override);
}

/** Every field the tenant has, active or not, for the settings screen. */
export async function listAllFields(): Promise<FieldDefinition[]> {
  return allFields(store.getState());
}

export type FieldPatch = FieldOverride;

/**
 * One entry point for editing any field, whatever its origin: a built-in field stores only the
 * tenant's differences (an override), a tenant field is rewritten, and a legacy custom field is
 * updated in its own store so its values stay where they are.
 */
export async function updateField(key: string, patch: FieldPatch): Promise<FieldDefinition> {
  const state = store.getState();
  const current = allFields(state).find((f) => f.key === key);
  if (!current) throw new CatalogError(`Unknown field "${key}".`);
  if (current.system && (patch.active === false || patch.required === false)) throw new CatalogError(`${current.label} identifies the item and cannot be switched off or made optional.`);

  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw new CatalogError("Field name is required.");
    const scope = current.categories === "All" ? state.categories.map((c) => c.key) : current.categories;
    for (const categoryKey of scope) {
      const clash = allFields(state).find((f) => f.key !== key && appliesToCategory(f, categoryKey) && normaliseToken(f.label) === normaliseToken(label));
      if (clash) throw new CatalogError(`${categoryKey} already has a field called "${clash.label}".`);
    }
    patch = { ...patch, label };
  }

  if (current.origin === "builtIn") {
    store.setOverride(key, patch);
  } else if (current.origin === "tenant") {
    store.upsertTenantField({ ...current, ...patch });
  } else {
    const id = key.replace(/^custom./, "");
    customFieldStore.update(id, {
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.required !== undefined && { required: patch.required }),
      ...(patch.active !== undefined && { active: patch.active }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
    });
  }
  const updated = allFields(store.getState()).find((f) => f.key === key);
  if (!updated) throw new CatalogError(`Field "${key}" disappeared while saving.`);
  return updated;
}

/** Removes a tenant-defined field. Values already on items are kept, just no longer shown or edited. */
export async function deleteTenantField(key: string): Promise<void> {
  const field = store.getState().tenantFields.find((f) => f.key === key);
  if (!field) throw new CatalogError("Only fields your business added can be deleted — switch built-in fields off instead.");
  store.removeTenantField(key);
}

/** Items per category key — shown next to each category, and why a category with stock can't be deleted. */
export async function countItemsByCategory(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const item of getAllItems()) counts[item.category] = (counts[item.category] ?? 0) + 1;
  return counts;
}

export async function getMarketSettings(): Promise<store.MarketSettings> {
  return store.getMarketSettings();
}

export async function updateMarketSettings(settings: store.MarketSettings): Promise<store.MarketSettings> {
  store.setMarketSettings(settings);
  return settings;
}
