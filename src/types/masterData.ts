/**
 * Master data = admin-governed setup/reference data (static, low-change-frequency), distinct
 * from transactional data (memos, items) that references it. This is the practical, frontend-only
 * version of the "per-tenant attribute-definition registry with types, vocabularies and
 * validation" that OCTAGEM-BLUEPRINT.md §7.2 specifies for the real backend — same idea,
 * scoped down to what a localStorage-backed admin UI can do without a schema migration story.
 */
export type MasterListKey =
  | "diamondShapes"
  | "diamondColors"
  | "diamondClarities"
  | "finishGrades"
  | "fluorescenceGrades"
  | "certificationLabs"
  | "diamondTreatments"
  | "fancyColorIntensities"
  | "metalTypes"
  | "metalKarats"
  | "metalColors"
  | "jewelryGroups"
  | "jewelrySubCategories"
  | "settingTypes"
  | "gemstoneTypes"
  | "watchBrands"
  | "watchMovements"
  | "watchCaseMaterials"
  | "watchFeatures"
  | "shipViaMethods"
  | "paymentTerms"
  | "taxRates"
  | "currencies";

/** Groups the (growing) list of master lists into sections for the Settings sidebar — see MasterDataSettings.tsx. */
export type MasterListSection = "diamond" | "jewelry" | "watch" | "sales";

export interface MasterListEntry {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
  /** Only meaningful for metalKarats: the metalTypes label this karat applies to (e.g. "Gold"). */
  scopeValue?: string;
  /**
   * Only meaningful when the list's definition sets `hasNumericValue`. For `taxRates`, the rate as
   * a percentage (8.875, not 0.08875). For `currencies`, units of this currency equal to 1 unit of
   * the tenant's base currency (base currency's own entry is always 1) — see lib/currency.ts.
   */
  numericValue?: number;
}

export interface MasterListDefinition {
  key: MasterListKey;
  section: MasterListSection;
  title: string;
  description: string;
  /** True if entries are scoped by another list's label (currently only metalKarats, scoped by metal type). */
  scopedBy?: MasterListKey;
  /** Set for lists whose entries carry a number alongside the label (tax rate %, currency FX rate). */
  hasNumericValue?: boolean;
  numericValueLabel?: string;
}

export const MASTER_LIST_SECTIONS: { key: MasterListSection; title: string }[] = [
  { key: "diamond", title: "Diamond" },
  { key: "jewelry", title: "Jewelry" },
  { key: "watch", title: "Watch" },
  { key: "sales", title: "Sales & Finance" },
];

export const MASTER_LISTS: MasterListDefinition[] = [
  { key: "diamondShapes", section: "diamond", title: "Diamond Shapes", description: "Used on the diamond intake form." },
  { key: "diamondColors", section: "diamond", title: "Diamond Colors", description: "GIA color scale, best first. Ranges like G-H are accepted wherever color is entered." },
  { key: "diamondClarities", section: "diamond", title: "Diamond Clarities", description: "GIA clarity scale, best first, plus the generic parcel grades (VS, SI). Ranges like SI1-SI2 are accepted." },
  { key: "finishGrades", section: "diamond", title: "Cut / Polish / Symmetry Grades", description: "Shared grading scale for cut, polish and symmetry." },
  { key: "fluorescenceGrades", section: "diamond", title: "Fluorescence", description: "Fluorescence strength scale." },
  { key: "certificationLabs", section: "diamond", title: "Certification Labs", description: "GIA, IGI and other grading labs." },
  { key: "diamondTreatments", section: "diamond", title: "Diamond Treatments", description: "Disclosed treatment/enhancement types." },
  { key: "fancyColorIntensities", section: "diamond", title: "Fancy Color Intensities", description: "GIA fancy-color scale, used on diamonds and mounted stones." },
  { key: "metalTypes", section: "jewelry", title: "Metal Types", description: "Gold, Platinum, Silver and similar." },
  { key: "metalKarats", section: "jewelry", title: "Metal Karats / Purity", description: "Scoped per metal type.", scopedBy: "metalTypes" },
  { key: "metalColors", section: "jewelry", title: "Metal Colors", description: "Yellow, White, Rose and similar." },
  { key: "jewelryGroups", section: "jewelry", title: "Jewelry Groups", description: "Top-level jewelry taxonomy, e.g. Bridal." },
  { key: "jewelrySubCategories", section: "jewelry", title: "Jewelry Sub-categories", description: "e.g. Halo Ring, Tennis Bracelet." },
  { key: "settingTypes", section: "jewelry", title: "Setting Types", description: "Prong, bezel, pavé and similar." },
  { key: "gemstoneTypes", section: "jewelry", title: "Gemstone Types", description: "Used on the jewelry Bill of Materials — real gem species plus plain metal/finding rows." },
  { key: "watchBrands", section: "watch", title: "Watch Brands", description: "Used on the watch intake form." },
  { key: "watchMovements", section: "watch", title: "Watch Movements", description: "Automatic, quartz and similar." },
  { key: "watchCaseMaterials", section: "watch", title: "Watch Case Materials", description: "Stainless steel, gold, titanium and similar." },
  { key: "watchFeatures", section: "watch", title: "Watch Features", description: "Complications — chronograph, GMT, moonphase and similar." },
  { key: "shipViaMethods", section: "sales", title: "Ship Via Methods", description: "Used on memo issue." },
  { key: "paymentTerms", section: "sales", title: "Payment Terms", description: "Used on memo issue." },
  { key: "taxRates", section: "sales", title: "Tax Rates", description: "Selectable on Quotes and Invoices.", hasNumericValue: true, numericValueLabel: "Rate %" },
  {
    key: "currencies",
    section: "sales",
    title: "Currencies",
    description: "Enabled currencies for Quotes, Sales Orders, Invoices and Purchase Orders. Label is the ISO code (e.g. USD).",
    hasNumericValue: true,
    numericValueLabel: "Rate to base (units of this currency per 1 base unit)",
  },
];

export interface LocationNode {
  id: string;
  label: string;
  parentId: string | null;
  active: boolean;
  sortOrder: number;
}
