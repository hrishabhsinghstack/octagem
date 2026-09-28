import { BUILT_IN_FIELDS } from "@/lib/inventory/builtInFields";
import { normaliseToken } from "@/lib/inventory/fieldValues";
import type { BuiltInFieldOverride, CategoryDefinition, FieldDefinition, FieldSection, FieldValue, MarketPackKey } from "@/types/catalog";
import type { CustomFieldDefinition } from "@/types/customField";
import type { MasterListEntry } from "@/types/masterData";

/**
 * Resolves "which fields does this category carry, in what order, with what options" from the
 * built-in catalog, tenant overrides, tenant-defined fields, legacy custom fields and enabled
 * market packs. Pure — the caller passes state in, so the same resolution runs in the form,
 * the import validator and tests.
 */

/** A built-in override may also re-scope an `attributes.*` field (a pack field) onto tenant categories. */
export type FieldOverride = BuiltInFieldOverride & { categories?: string[] };

export interface CatalogState {
  categories: CategoryDefinition[];
  overrides: Record<string, FieldOverride>;
  tenantFields: FieldDefinition[];
  customFields: CustomFieldDefinition[];
  enabledPacks: MarketPackKey[];
}

const SECTION_ORDER: FieldSection[] = ["identity", "specification", "certificate", "components", "pricing", "market", "custom"];

/** Adapts a legacy custom field (Settings → Custom Fields) into the catalog, without moving its stored values. */
export function customFieldToDefinition(definition: CustomFieldDefinition): FieldDefinition {
  return {
    key: `custom.${definition.id}`,
    label: definition.label,
    type: definition.type === "dropdown" ? "select" : definition.type,
    section: "custom",
    path: `customFields.${definition.id}`,
    categories: definition.appliesTo === "All" ? "All" : [definition.appliesTo],
    source: definition.type === "dropdown" ? { kind: "options", values: definition.options ?? [] } : undefined,
    required: definition.required,
    active: definition.active,
    sortOrder: definition.sortOrder,
    origin: "customField",
  };
}

export function applyOverride(field: FieldDefinition, override: FieldOverride | undefined): FieldDefinition {
  if (!override) return field;
  const next: FieldDefinition = { ...field, ...override, categories: field.categories };
  // Stock number and name identify the item; a tenant can relabel them but never switch them off.
  if (field.system) {
    next.active = true;
    next.required = true;
  }
  // Only attribute-bag fields can move to other categories — a diamond.* path on a watch would be meaningless.
  if (override.categories && field.path.startsWith("attributes.")) next.categories = override.categories;
  return next;
}

/** Every field the tenant has, active or not — for the settings screen. */
export function allFields(state: CatalogState): FieldDefinition[] {
  return [
    ...BUILT_IN_FIELDS.map((field) => applyOverride(field, state.overrides[field.key])),
    ...state.tenantFields,
    ...state.customFields.map(customFieldToDefinition),
  ];
}

export function appliesToCategory(field: FieldDefinition, categoryKey: string): boolean {
  return field.categories === "All" || field.categories.includes(categoryKey);
}

/** Active fields for one category, in form order: by section, then sortOrder. */
export function fieldsForCategory(state: CatalogState, categoryKey: string): FieldDefinition[] {
  return allFields(state)
    .filter((field) => field.active && appliesToCategory(field, categoryKey) && (!field.pack || state.enabledPacks.includes(field.pack)))
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.sortOrder - b.sortOrder);
}

export interface OptionLookups {
  getList: (key: string) => MasterListEntry[];
  locationPaths: () => string[];
}

/** Allowed values for a select field. A scoped list with no parent value yet offers nothing — pick the metal first. */
export function resolveOptions(field: FieldDefinition, values: Record<string, FieldValue>, lookups: OptionLookups): string[] {
  const source = field.source;
  if (!source) return [];
  if (source.kind === "options") return source.values;
  if (source.kind === "locations") return lookups.locationPaths();
  const entries = lookups.getList(source.key).filter((entry) => entry.active);
  if (!source.scopedByField) return entries.map((entry) => entry.label);
  const parent = values[source.scopedByField];
  if (typeof parent !== "string" || !parent) return [];
  return entries.filter((entry) => normaliseToken(entry.scopeValue ?? "") === normaliseToken(parent)).map((entry) => entry.label);
}

/** Whether a field applies given the current values — hidden fields are neither shown nor validated. */
export function isFieldVisible(field: FieldDefinition, values: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  const value = values[field.visibleWhen.field];
  return typeof value === "string" && field.visibleWhen.in.includes(value);
}

/**
 * Options for a field in the context of one category. Identity model is narrowed to the models the
 * category allows (a watch is never a parcel); everything else comes from resolveOptions.
 */
export function optionsForField(field: FieldDefinition, values: Record<string, FieldValue>, category: CategoryDefinition | undefined, lookups: OptionLookups): string[] {
  if (field.key === "identityModel" && category) return category.allowedIdentityModels;
  return resolveOptions(field, values, lookups);
}

/**
 * Maps normalised spreadsheet headers to field keys (key, label and every alias). Two fields
 * claiming the same header within one category is a catalog bug — reported, never guessed.
 */
export function headerLookup(fields: FieldDefinition[]): { lookup: Map<string, string>; conflicts: string[] } {
  const lookup = new Map<string, string>();
  const conflicts: string[] = [];
  for (const field of fields) {
    const headers = new Set([field.key, field.label, ...(field.aliases ?? [])].map(normaliseToken));
    for (const header of headers) {
      const owner = lookup.get(header);
      if (owner && owner !== field.key) conflicts.push(`"${header}" → ${owner} and ${field.key}`);
      else lookup.set(header, field.key);
    }
  }
  return { lookup, conflicts };
}
