import type { IdentityModel } from "@/types/inventory";

/**
 * The inventory catalog: which categories a tenant stocks and which fields each one carries.
 * One field definition drives four consumers — the intake form, the detail view, the import
 * template/validator and the export — so a field is declared once, not four times.
 *
 * Built-in categories (Diamond, Jewelry, Watch) keep their existing keys, so every item already
 * stored stays valid; tenants add their own categories next to them.
 */

/** A unit the category's primary weight is measured in. "none" for piece-counted goods. */
export type WeightUnit = "ct" | "g" | "none";

export interface CategoryDefinition {
  /** Stable key stored on InventoryItem.category. Never renamed once items reference it. */
  key: string;
  label: string;
  /** Built-ins ship with the product and can be deactivated but not deleted. */
  builtIn: boolean;
  active: boolean;
  sortOrder: number;
  /** Lucide icon name, resolved by the UI; unknown names fall back to a generic box. */
  icon: string;
  defaultIdentityModel: IdentityModel;
  allowedIdentityModels: IdentityModel[];
  /** Stock numbers are suggested as `${stockPrefix}${number}`, e.g. "D-" + 1151. */
  stockPrefix: string;
  /** The first number used when no stock number with this prefix exists yet. */
  stockStartNumber: number;
  /** Minimum digits, zero-padded (4 → D-0042). 0 disables padding. */
  stockPadding: number;
  weightUnit: WeightUnit;
}

/**
 * A market pack is a switchable bundle of region-specific fields and defaults — e.g. the India
 * pack adds HUID and making-charge basis. Tenants operating in several markets enable several.
 */
export type MarketPackKey = "IN";

export interface MarketPack {
  key: MarketPackKey;
  label: string;
  description: string;
}

export type FieldType = "text" | "number" | "integer" | "date" | "boolean" | "select" | "multiselect";

export type FieldValue = string | number | boolean | string[];

/** Where a select field's allowed values come from. */
export type FieldOptionSource =
  /** An admin-maintained master list. `scopedByField` filters entries by another field's value (karat by metal). */
  | { kind: "masterList"; key: string; scopedByField?: string }
  /** The location tree, as breadcrumb paths. */
  | { kind: "locations" }
  /** A fixed list declared on the field itself. */
  | { kind: "options"; values: string[] };

export type FieldSection = "identity" | "specification" | "certificate" | "components" | "pricing" | "market" | "custom";

export interface FieldDefinition {
  /** Stable key, unique across the catalog. Import templates use it as the hidden column id. */
  key: string;
  label: string;
  type: FieldType;
  section: FieldSection;
  /**
   * Dot path to the value on an InventoryItem — "diamond.color", "attributes.huid",
   * "customFields.cf-3". Lets built-in typed attributes, pack fields and tenant fields coexist
   * without migrating stored data.
   */
  path: string;
  /** Category keys this field applies to, or "All". */
  categories: string[] | "All";
  /** Set when the field belongs to a market pack and only appears while that pack is enabled. */
  pack?: MarketPackKey;
  source?: FieldOptionSource;
  required: boolean;
  /**
   * Compared case-, space- and punctuation-insensitively. "always": across every item ever held
   * (stock numbers — they are item ids). "live": only among stock not Sold / Returned to vendor,
   * since a certificate or HUID legitimately comes back on a buy-back.
   */
  unique?: "always" | "live";
  /** Text is stored upper-cased (stock numbers, HUID). */
  uppercase?: boolean;
  min?: number;
  max?: number;
  /** For number fields: maximum decimal places accepted. */
  decimals?: number;
  /** For text fields: a regex the normalised value must match, with a human message. */
  pattern?: { regex: string; message: string };
  /**
   * For select fields. "strict" (default): the value must come from the list — grades, labs,
   * treatments, where a stray spelling breaks search and disclosure. "open": the list is a set of
   * suggestions; a match is normalised to the list's spelling, anything else is kept as typed —
   * for naturally open-ended values like watch case materials or combined setting types.
   */
  listMode?: "strict" | "open";
  /** For ordinal select scales (color, clarity): accept "G-H" style ranges when both ends are valid. */
  allowRange?: boolean;
  /** Display unit suffix, e.g. "ct", "g", "%", "mm". */
  unit?: string;
  /** Alternative column headers recognised on import ("Clr", "Colour"). Matched case-insensitively. */
  aliases?: string[];
  help?: string;
  /**
   * "detail" fields sit behind a "More details" toggle on the form, so the fields entered on every
   * piece stay in view. Purely presentational — detail fields validate and import like any other.
   */
  tier?: "essential" | "detail";
  /** Shown (and validated) only while another field's value is one of these — e.g. Pieces only for LOT/QUANTITY stock. */
  visibleWhen?: { field: string; in: string[] };
  /** System fields (stock #, name) cannot be deactivated or made optional. */
  system?: boolean;
  active: boolean;
  showInList?: boolean;
  sortOrder: number;
  /** Where the definition came from — built-ins live in code, tenant and custom fields in storage. */
  origin: "builtIn" | "tenant" | "customField";
}

/** Tenant edits to a built-in field. Built-in definitions themselves live in code and are never stored. */
export type BuiltInFieldOverride = Partial<Pick<FieldDefinition, "label" | "required" | "active" | "showInList" | "sortOrder" | "listMode" | "tier">>;
