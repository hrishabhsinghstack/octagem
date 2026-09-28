import { BUILT_IN_CATEGORIES } from "@/lib/inventory/builtInFields";
import type { DateOrder } from "@/lib/inventory/fieldValues";
import type { CatalogState, FieldOverride } from "@/lib/inventory/registry";
import { getAll as getCustomFields } from "@/lib/store/customFieldStore";
import type { CategoryDefinition, FieldDefinition, MarketPackKey } from "@/types/catalog";

/**
 * localStorage-backed catalog configuration: the tenant's categories, edits to built-in fields,
 * tenant-defined fields and market settings. Built-in field definitions live in code
 * (lib/inventory/builtInFields.ts) and are never stored — only the tenant's differences are.
 */
const STORAGE_KEY = "octagem.catalog.local";

export interface MarketSettings {
  enabledPacks: MarketPackKey[];
  /** How ambiguous dates like 03/04/2026 are read on import — US sheets are MDY, India and most others DMY. */
  dateOrder: DateOrder;
  /** Intl locale for number display — "en-US" groups 1,234,567, "en-IN" groups 12,34,567. */
  numberLocale: string;
}

interface StoredCatalog {
  categories: CategoryDefinition[];
  overrides: Record<string, FieldOverride>;
  tenantFields: FieldDefinition[];
  market: MarketSettings;
}

const DEFAULT_MARKET: MarketSettings = { enabledPacks: [], dateOrder: "MDY", numberLocale: "en-US" };

const seed = (): StoredCatalog => ({ categories: BUILT_IN_CATEGORIES.map((c) => ({ ...c })), overrides: {}, tenantFields: [], market: { ...DEFAULT_MARKET } });

/** Fills in anything a newer release added — a new built-in category, a new market setting — without touching tenant edits. */
function migrate(stored: Partial<StoredCatalog>): { catalog: StoredCatalog; changed: boolean } {
  let changed = false;
  const categories = Array.isArray(stored.categories) ? [...stored.categories] : [];
  for (const builtIn of BUILT_IN_CATEGORIES) {
    if (!categories.some((c) => c.key === builtIn.key)) {
      categories.push({ ...builtIn });
      changed = true;
    }
  }
  const market = { ...DEFAULT_MARKET, ...(stored.market ?? {}) };
  if (!stored.market || !stored.overrides || !stored.tenantFields) changed = true;
  return { catalog: { categories, overrides: stored.overrides ?? {}, tenantFields: stored.tenantFields ?? [], market }, changed };
}

function read(): StoredCatalog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { catalog, changed } = migrate(JSON.parse(raw) as Partial<StoredCatalog>);
      if (changed) write(catalog);
      return catalog;
    }
  } catch {
    // fall through to reseed
  }
  const catalog = seed();
  write(catalog);
  return catalog;
}

function write(catalog: StoredCatalog) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
}

export function getState(): CatalogState {
  const catalog = read();
  return {
    categories: [...catalog.categories].sort((a, b) => a.sortOrder - b.sortOrder),
    overrides: catalog.overrides,
    tenantFields: catalog.tenantFields,
    customFields: getCustomFields(),
    enabledPacks: catalog.market.enabledPacks,
  };
}

export function getCategories(activeOnly = true): CategoryDefinition[] {
  const categories = getState().categories;
  return activeOnly ? categories.filter((c) => c.active) : categories;
}

export function getCategory(key: string): CategoryDefinition | undefined {
  return read().categories.find((c) => c.key === key);
}

export function upsertCategory(category: CategoryDefinition): CategoryDefinition {
  const catalog = read();
  const index = catalog.categories.findIndex((c) => c.key === category.key);
  if (index === -1) catalog.categories.push(category);
  else catalog.categories[index] = category;
  write(catalog);
  return category;
}

export function removeCategory(key: string) {
  const catalog = read();
  write({ ...catalog, categories: catalog.categories.filter((c) => c.key !== key) });
}

export function setOverride(fieldKey: string, override: FieldOverride) {
  const catalog = read();
  write({ ...catalog, overrides: { ...catalog.overrides, [fieldKey]: { ...catalog.overrides[fieldKey], ...override } } });
}

export function upsertTenantField(field: FieldDefinition): FieldDefinition {
  const catalog = read();
  const index = catalog.tenantFields.findIndex((f) => f.key === field.key);
  if (index === -1) catalog.tenantFields.push(field);
  else catalog.tenantFields[index] = field;
  write(catalog);
  return field;
}

export function removeTenantField(key: string) {
  const catalog = read();
  write({ ...catalog, tenantFields: catalog.tenantFields.filter((f) => f.key !== key) });
}

export function getMarketSettings(): MarketSettings {
  return read().market;
}

export function setMarketSettings(market: MarketSettings) {
  write({ ...read(), market });
  cachedNumberLocale = undefined;
}

let cachedNumberLocale: string | undefined;

/**
 * The tenant's number-display locale, cached — formatCurrency runs for every price on every render,
 * so it must not re-read storage each time. Cleared by setMarketSettings.
 */
export function getNumberLocale(): string {
  if (cachedNumberLocale === undefined) {
    try {
      cachedNumberLocale = read().market.numberLocale;
    } catch {
      return DEFAULT_MARKET.numberLocale;
    }
  }
  return cachedNumberLocale;
}
