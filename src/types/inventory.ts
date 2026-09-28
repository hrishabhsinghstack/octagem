/**
 * Simplified for a backend-less UI pass, but field coverage matches
 * DATA-FIELD-CATALOG.md §2-§4 (the legacy-screenshot field inventory). Shaped to match
 * OCTAGEM-BLUEPRINT.md §7 vocabulary (identity model, category attributes, ledger-style
 * movement history) so the real ledger engine can replace `ledger`/`status` without renaming
 * anything call sites depend on.
 */
/** The categories that ship with the product and carry typed attribute blocks (diamond/jewelry/watch). */
export type BuiltInCategory = "Diamond" | "Jewelry" | "Watch";

/**
 * Key of a CategoryDefinition (types/catalog.ts). Built-in keys match BuiltInCategory; tenants add
 * their own, whose attributes live in InventoryItem.attributes rather than a typed block.
 */
export type InventoryCategory = string;

/** §7.1 — a stone/watch is UNIQUE, a parcel is LOT, a repeatable jewelry style is QUANTITY. */
export type IdentityModel = "UNIQUE" | "LOT" | "QUANTITY";

/** "Reserved" was dropped with Sales Orders — allocation was the only thing that ever set it. Stored items still carrying it migrate back to Available; see store/inventoryStore.ts. */
export type ItemStatus = "Available" | "On memo out" | "Verification hold" | "Sold" | "Returned to vendor";

/** §2.2/§13.5 — ownership is independent of status: a consigned item is fully sellable (status Available) but not owned until it sells. */
export type ItemOwnership = "OWNED" | "CONSIGNED_IN";

export interface LedgerEntry {
  id: string;
  occurredAt: string;
  type:
    | "PURCHASE_RECEIPT"
    | "CONSIGNMENT_IN"
    | "CONSIGNMENT_RETURN"
    | "MEMO_OUT"
    | "MEMO_RETURN_IN"
    | "TRANSFER"
    | "SALE"
    | "COUNT_ADJUSTMENT"
    | "PRODUCTION_CONSUMPTION";
  note: string;
  actor: string;
  /** Set on movements written by a spreadsheet import, so the import can be undone precisely. */
  batchId?: string;
}

export interface FancyColor {
  intensity: string;
  overtone?: string;
}

export interface Measurements {
  lengthMm: number;
  widthMm: number;
  depthMm: number;
}

export interface OnHold {
  customer: string;
  expiresAt: string;
}

export interface DiamondAttributes {
  shape: string;
  caratWeight: number;
  measurements?: Measurements;
  color: string;
  fancyColor?: FancyColor;
  clarity: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  depthPct?: number;
  tablePct?: number;
  crownAngle?: number;
  pavilionAngle?: number;
  girdle?: string;
  culet?: string;
  treatment?: string;
  eyeClean?: "Yes" | "No" | "Not assessed";
  lab: string;
  certificateNumber: string;
  certificateDate?: string;
  certificateComments?: string;
  isLabGrown: boolean;
  matchingStoneCode?: string;
  stoneRatio?: number;
  rapPricePerCarat?: number;
  rapDiscountPct?: number;
  rapListDate?: string;
  onHold?: OnHold;
  channels?: string[];
}

export interface JewelryComponent {
  id: string;
  /** Master-data-driven (the "gemstoneTypes" list) — free string, not a hardcoded union, so it covers real gem species plus non-gem BOM rows like plain metal or findings. */
  type: string;
  shape?: string;
  color?: string;
  fancyColor?: FancyColor;
  clarity?: string;
  /** Per-stone treatment — mounted stones don't always share the piece's overall treatment. */
  treatment?: string;
  lab?: string;
  certificateNumber?: string;
  quantity: number;
  weightCarats?: number;
  /** e.g. a melee size range — distinct from weightCarats. */
  size?: string;
  isCenter: boolean;
  /** An identifying number for this specific stone within the piece, distinct from certificateNumber. */
  stoneNumber?: string;
  /** Links back to the loose-stone inventory item this component was consumed from. */
  sourceItemId?: string;
}

export interface JewelryAttributes {
  styleNumber: string;
  group?: string;
  subCategory?: string;
  metalType: string;
  metalColor?: string;
  metalKarat?: string;
  grossWeightGrams: number;
  netWeightGrams?: number;
  sizeWidth?: string;
  settingType?: string;
  hallmark?: string;
  /** The vendor's own reference number for this item, distinct from the internal stock code. */
  vendorStockNumber?: string;
  /** Cost of the metal alone, separate from making/setting cost — matters for margin tracking when metal prices move. */
  metalCost?: number;
  /** Making charges — the India-market pricing-formula input (blueprint §20.6), distinct from metal cost. */
  jewelryExpense?: number;
  tagPrice?: number;
  retailPrice?: number;
  /** Sell price for the setting alone, separate from the mounted stones' value. */
  mountingSellPrice?: number;
  markupPct?: number;
  totalDiamondCarats?: number;
  totalGemCarats?: number;
  components: JewelryComponent[];
}

export interface ServiceEvent {
  date: string;
  note: string;
}

export interface Authentication {
  status: "Pending inspection" | "Authenticated in house" | "Third-party authenticated";
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface WatchAttributes {
  brand: string;
  model?: string;
  gender?: "Men's" | "Women's" | "Unisex";
  referenceNumber: string;
  modelNumber?: string;
  serialNumber: string;
  caseMaterial?: string;
  caseSizeMm?: number;
  movement?: string;
  dial?: string;
  bezel?: string;
  bracelet?: string;
  diamondWeightCarats?: number;
  yearOfProduction?: number;
  hasBox: boolean;
  hasPapers: boolean;
  warrantyCardDate?: string;
  conditionGrade: "Unworn" | "Excellent" | "Very good" | "Good";
  authentication?: Authentication;
  serviceHistory?: ServiceEvent[];
  basePrice?: number;
  retailPrice?: number;
  ourPrice?: number;
  markupPct?: number;
  /** Master-data-driven (the "watchFeatures" list) — complications like chronograph, GMT, moonphase. */
  features?: string[];
}

/**
 * Documents & media (DATA-FIELD-CATALOG.md §1) — a tagged gallery rather than the legacy
 * system's rigid single slots (one Certificate Image, one Stone Image, a 4-slot photo gallery),
 * so a piece with six mounted stones can carry six stone photos, not one.
 */
export type MediaKind = "Product Photo" | "Certificate" | "Stone Photo" | "Appraisal";

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  dataUrl: string;
  fileName: string;
  uploadedAt: string;
  isPrimary: boolean;
}

export interface InventoryItem {
  id: string;
  code: string;
  category: InventoryCategory;
  identityModel: IdentityModel;
  /** Piece count for LOT and QUANTITY stock. Absent for UNIQUE items, which are always exactly one. */
  quantity?: number;
  title: string;
  description: string;
  status: ItemStatus;
  location: string;
  custodyHolder: string;
  cost: number;
  askingPrice: number;
  receivedAt: string;
  /** Provenance — which vendor and (if applicable) purchase order this item was received against. */
  vendorId?: string;
  purchaseOrderId?: string;
  /** Defaults to OWNED for regular purchases; CONSIGNED_IN items carry no cost layer (cost stays 0) and instead owe the vendor `consignmentValue` if/when they sell (§13.5). */
  ownership: ItemOwnership;
  consignmentValue?: number;
  /** How the consignment value was derived — quoted at memo time, not a locked sale price (mirrors MemoLine.priceBasis). */
  consignmentPriceBasis?: string;
  memoInId?: string;
  diamond?: DiamondAttributes;
  jewelry?: JewelryAttributes;
  watch?: WatchAttributes;
  /** Values for catalog fields with an `attributes.*` path — tenant-category fields and market-pack fields (types/catalog.ts). */
  attributes?: Record<string, string | number | boolean | string[]>;
  /** Tenant-defined extra fields, keyed by CustomFieldDefinition.id — see types/customField.ts. */
  customFields?: Record<string, string | number | boolean>;
  media: MediaAsset[];
  ledger: LedgerEntry[];
}
