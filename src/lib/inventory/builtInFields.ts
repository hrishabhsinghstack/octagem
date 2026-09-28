import type { CategoryDefinition, FieldDefinition, FieldOptionSource, MarketPack } from "@/types/catalog";

/**
 * The product's own field catalog. Paths point at the existing typed attribute blocks
 * (item.diamond / .jewelry / .watch), so stored items need no migration. Market-pack fields live
 * under `attributes.*`. Aliases include the legacy iDiamondCloud screen labels
 * (DATA-FIELD-CATALOG.md, blueprint §3) and RapNet feed headers, so a client's existing export
 * maps on import without manual column matching.
 *
 * Jewelry Bill of Materials rows are not flat fields — they are a child table, handled separately.
 */

export const BUILT_IN_CATEGORIES: CategoryDefinition[] = [
  {
    key: "Diamond",
    label: "Diamond",
    builtIn: true,
    active: true,
    sortOrder: 0,
    icon: "diamond",
    defaultIdentityModel: "UNIQUE",
    allowedIdentityModels: ["UNIQUE", "LOT"],
    stockPrefix: "D-",
    stockStartNumber: 1001,
    stockPadding: 0,
    weightUnit: "ct",
  },
  {
    key: "Jewelry",
    label: "Jewelry",
    builtIn: true,
    active: true,
    sortOrder: 1,
    icon: "gem",
    defaultIdentityModel: "QUANTITY",
    allowedIdentityModels: ["UNIQUE", "QUANTITY"],
    stockPrefix: "J-",
    stockStartNumber: 2001,
    stockPadding: 0,
    weightUnit: "g",
  },
  {
    key: "Watch",
    label: "Watch",
    builtIn: true,
    active: true,
    sortOrder: 2,
    icon: "watch",
    defaultIdentityModel: "UNIQUE",
    allowedIdentityModels: ["UNIQUE"],
    stockPrefix: "W-",
    stockStartNumber: 3001,
    stockPadding: 0,
    weightUnit: "none",
  },
];

export const MARKET_PACKS: MarketPack[] = [
  {
    key: "IN",
    label: "India",
    description: "HUID (BIS hallmark unique ID), making-charge basis and wastage for gold jewellery.",
  },
];

const list = (key: string, scopedByField?: string): FieldOptionSource => ({ kind: "masterList", key, scopedByField });
const options = (...values: string[]): FieldOptionSource => ({ kind: "options", values });

type Seed = Omit<FieldDefinition, "active" | "origin" | "sortOrder" | "required"> & { required?: boolean };

let order = 0;
const field = (seed: Seed): FieldDefinition => ({ required: false, active: true, origin: "builtIn", sortOrder: order++, ...seed });

const PRICE = { type: "number" as const, min: 0, decimals: 2 };
const PERCENT = { type: "number" as const, decimals: 2, unit: "%" };
const MM = { type: "number" as const, min: 0, decimals: 2, unit: "mm" };

const COMMON: FieldDefinition[] = [
  field({
    key: "code",
    label: "Stock number",
    type: "text",
    section: "identity",
    path: "code",
    categories: "All",
    required: true,
    system: true,
    unique: "always",
    uppercase: true,
    pattern: { regex: "^[A-Z0-9][A-Z0-9\\-_/.]{0,39}$", message: "Letters, numbers and - _ / . only, up to 40 characters" },
    aliases: ["stock #", "stock no", "stock number", "stocknumber", "stone number", "sku", "item code", "code", "tag no"],
    showInList: true,
  }),
  field({
    key: "title",
    label: "Item name",
    type: "text",
    section: "identity",
    path: "title",
    categories: "All",
    required: true,
    system: true,
    aliases: ["name", "title", "item name", "item"],
    showInList: true,
  }),
  field({ key: "description", label: "Description", type: "text", section: "identity", path: "description", categories: "All", aliases: ["description", "desc", "remarks"] }),
  field({
    key: "identityModel",
    label: "Identity model",
    type: "select",
    section: "identity",
    path: "identityModel",
    categories: "All",
    source: options("UNIQUE", "LOT", "QUANTITY"),
    help: "Leave blank to use the category default.",
  }),
  field({
    key: "quantity",
    label: "Pieces",
    type: "integer",
    section: "identity",
    path: "quantity",
    categories: "All",
    min: 1,
    visibleWhen: { field: "identityModel", in: ["LOT", "QUANTITY"] },
    aliases: ["pieces", "pcs", "qty", "quantity", "no of pieces"],
  }),
  field({
    key: "location",
    label: "Location",
    type: "select",
    section: "identity",
    path: "location",
    categories: "All",
    source: { kind: "locations" },
    aliases: ["location", "in house location", "tray", "vault"],
    showInList: true,
  }),
  // Required for owned stock; the form drops it for consignment receipts, which carry no cost layer.
  field({ key: "cost", label: "Cost", ...PRICE, section: "pricing", path: "cost", categories: "All", required: true, aliases: ["cost", "on hand cost", "last import cost", "purchase price", "acquisition cost"] }),
  field({
    key: "askingPrice",
    label: "Asking price",
    ...PRICE,
    section: "pricing",
    path: "askingPrice",
    categories: "All",
    required: true,
    aliases: ["asking price", "price", "sell price", "total sell price", "selling price"],
    showInList: true,
  }),
];

const DIAMOND: FieldDefinition[] = [
  field({ key: "diamond.shape", label: "Shape", type: "select", section: "specification", path: "diamond.shape", categories: ["Diamond"], source: list("diamondShapes"), required: true, aliases: ["shape"] }),
  field({
    key: "diamond.caratWeight",
    label: "Carat",
    type: "number",
    section: "specification",
    path: "diamond.caratWeight",
    categories: ["Diamond"],
    required: true,
    min: 0.001,
    max: 1000,
    decimals: 3,
    unit: "ct",
    aliases: ["carat", "carats", "weight", "cts", "ct"],
  }),
  field({ key: "diamond.color", label: "Color", type: "select", section: "specification", path: "diamond.color", categories: ["Diamond"], source: list("diamondColors"), allowRange: true, aliases: ["color", "colour", "clr", "col"] }),
  field({ key: "diamond.fancyColorIntensity", tier: "detail", label: "Fancy color intensity", type: "select", section: "specification", path: "diamond.fancyColor.intensity", categories: ["Diamond"], source: list("fancyColorIntensities"), aliases: ["fancy color", "fancy color intensity", "fancy intensity"] }),
  field({ key: "diamond.fancyColorOvertone", tier: "detail", label: "Fancy color overtone", type: "text", section: "specification", path: "diamond.fancyColor.overtone", categories: ["Diamond"], aliases: ["fancy color overtone", "overtone"] }),
  field({ key: "diamond.clarity", label: "Clarity", type: "select", section: "specification", path: "diamond.clarity", categories: ["Diamond"], source: list("diamondClarities"), allowRange: true, aliases: ["clarity", "clar", "purity"] }),
  field({ key: "diamond.cut", label: "Cut", type: "select", section: "specification", path: "diamond.cut", categories: ["Diamond"], source: list("finishGrades"), aliases: ["cut", "cut grade", "make"] }),
  field({ key: "diamond.polish", label: "Polish", type: "select", section: "specification", path: "diamond.polish", categories: ["Diamond"], source: list("finishGrades"), aliases: ["polish", "pol"] }),
  field({ key: "diamond.symmetry", label: "Symmetry", type: "select", section: "specification", path: "diamond.symmetry", categories: ["Diamond"], source: list("finishGrades"), aliases: ["symmetry", "sym", "symm"] }),
  field({ key: "diamond.fluorescence", label: "Fluorescence", type: "select", section: "specification", path: "diamond.fluorescence", categories: ["Diamond"], source: list("fluorescenceGrades"), aliases: ["fluorescence", "fluorescence intensity", "fluor", "flo", "fl"] }),
  field({ key: "diamond.lengthMm", tier: "detail", label: "Length", ...MM, section: "specification", path: "diamond.measurements.lengthMm", categories: ["Diamond"], aliases: ["length", "measurement length"] }),
  field({ key: "diamond.widthMm", tier: "detail", label: "Width", ...MM, section: "specification", path: "diamond.measurements.widthMm", categories: ["Diamond"], aliases: ["width", "measurement width"] }),
  field({ key: "diamond.depthMm", tier: "detail", label: "Depth (mm)", ...MM, section: "specification", path: "diamond.measurements.depthMm", categories: ["Diamond"], aliases: ["depth mm", "measurement depth"] }),
  field({ key: "diamond.depthPct", tier: "detail", label: "Depth %", ...PERCENT, min: 0, max: 100, section: "specification", path: "diamond.depthPct", categories: ["Diamond"], aliases: ["depth %", "depth percent", "depth"] }),
  field({ key: "diamond.tablePct", tier: "detail", label: "Table %", ...PERCENT, min: 0, max: 100, section: "specification", path: "diamond.tablePct", categories: ["Diamond"], aliases: ["table %", "table percent", "table"] }),
  field({ key: "diamond.crownAngle", tier: "detail", label: "Crown angle", type: "number", min: 0, max: 90, decimals: 2, unit: "°", section: "specification", path: "diamond.crownAngle", categories: ["Diamond"], aliases: ["crown a", "crown angle"] }),
  field({ key: "diamond.pavilionAngle", tier: "detail", label: "Pavilion angle", type: "number", min: 0, max: 90, decimals: 2, unit: "°", section: "specification", path: "diamond.pavilionAngle", categories: ["Diamond"], aliases: ["pavillion a", "pavilion a", "pavilion angle"] }),
  field({ key: "diamond.girdle", tier: "detail", label: "Girdle", type: "text", section: "specification", path: "diamond.girdle", categories: ["Diamond"], aliases: ["girdle", "girdle condition"] }),
  field({ key: "diamond.culet", tier: "detail", label: "Culet", type: "text", section: "specification", path: "diamond.culet", categories: ["Diamond"], aliases: ["culet", "culet size"] }),
  field({ key: "diamond.treatment", label: "Treatment", type: "select", section: "specification", path: "diamond.treatment", categories: ["Diamond"], source: list("diamondTreatments"), aliases: ["treatment", "enhancement"] }),
  field({ key: "diamond.eyeClean", tier: "detail", label: "Eye clean", type: "select", section: "specification", path: "diamond.eyeClean", categories: ["Diamond"], source: options("Yes", "No", "Not assessed"), aliases: ["eye clean", "ec"] }),
  field({ key: "diamond.isLabGrown", label: "Lab grown", type: "boolean", section: "specification", path: "diamond.isLabGrown", categories: ["Diamond"], aliases: ["lab grown", "lgd", "cvd", "growth type"] }),
  field({ key: "diamond.matchingStoneCode", tier: "detail", label: "Matching stone", type: "text", section: "specification", path: "diamond.matchingStoneCode", categories: ["Diamond"], uppercase: true, aliases: ["matching stone", "pair stock #"] }),
  field({ key: "diamond.lab", label: "Lab", type: "select", section: "certificate", path: "diamond.lab", categories: ["Diamond"], source: list("certificationLabs"), aliases: ["lab", "certificate lab", "grading lab"] }),
  field({
    key: "diamond.certificateNumber",
    label: "Certificate #",
    type: "text",
    section: "certificate",
    path: "diamond.certificateNumber",
    categories: ["Diamond"],
    unique: "live",
    aliases: ["certificate #", "certificate no", "certificate number", "cert #", "cert no", "report #", "report no"],
  }),
  field({ key: "diamond.certificateDate", tier: "detail", label: "Certificate date", type: "date", section: "certificate", path: "diamond.certificateDate", categories: ["Diamond"], aliases: ["cert. date", "cert date", "certificate date", "report date"] }),
  field({ key: "diamond.certificateComments", tier: "detail", label: "Certificate comments", type: "text", section: "certificate", path: "diamond.certificateComments", categories: ["Diamond"], aliases: ["certificate comments", "report comments", "key to symbols"] }),
  field({ key: "diamond.rapPricePerCarat", label: "Rap price / ct", ...PRICE, section: "pricing", path: "diamond.rapPricePerCarat", categories: ["Diamond"], aliases: ["rap price", "rapnet price", "rap", "rap/ct"] }),
  field({ key: "diamond.rapDiscountPct", label: "Discount off Rap", ...PERCENT, min: -100, max: 100, section: "pricing", path: "diamond.rapDiscountPct", categories: ["Diamond"], aliases: ["rap %", "sell % off rap", "rapnet discount %", "discount", "back"] }),
  field({ key: "diamond.rapListDate", tier: "detail", label: "Rap list date", type: "date", section: "pricing", path: "diamond.rapListDate", categories: ["Diamond"], aliases: ["date of rap price", "rap date"] }),
];

const JEWELRY: FieldDefinition[] = [
  field({ key: "jewelry.styleNumber", label: "Style #", type: "text", section: "specification", path: "jewelry.styleNumber", categories: ["Jewelry"], required: true, uppercase: true, aliases: ["style #", "style no", "style number", "design no"] }),
  field({ key: "jewelry.group", label: "Group", type: "select", section: "specification", path: "jewelry.group", categories: ["Jewelry"], source: list("jewelryGroups"), aliases: ["group", "jewelry group"] }),
  field({ key: "jewelry.subCategory", label: "Sub-category", type: "select", section: "specification", path: "jewelry.subCategory", categories: ["Jewelry"], source: list("jewelrySubCategories"), aliases: ["sub category", "subcategory", "sub-category"] }),
  field({ key: "jewelry.metalType", label: "Metal", type: "select", section: "specification", path: "jewelry.metalType", categories: ["Jewelry"], source: list("metalTypes"), required: true, aliases: ["metal", "metal type"] }),
  field({ key: "jewelry.metalKarat", label: "Karat / purity", type: "select", section: "specification", path: "jewelry.metalKarat", categories: ["Jewelry"], source: list("metalKarats", "jewelry.metalType"), aliases: ["karat", "kt", "purity", "metal purity"] }),
  field({ key: "jewelry.metalColor", label: "Metal color", type: "select", section: "specification", path: "jewelry.metalColor", categories: ["Jewelry"], source: list("metalColors"), aliases: ["metal color", "metal colour", "gold color"] }),
  field({ key: "jewelry.grossWeightGrams", label: "Gross weight", type: "number", min: 0, decimals: 3, unit: "g", section: "specification", path: "jewelry.grossWeightGrams", categories: ["Jewelry"], required: true, aliases: ["gross weight", "gross wt", "gr wt", "gwt"] }),
  field({ key: "jewelry.netWeightGrams", tier: "detail", label: "Net weight", type: "number", min: 0, decimals: 3, unit: "g", section: "specification", path: "jewelry.netWeightGrams", categories: ["Jewelry"], aliases: ["net weight", "net wt", "nwt", "metal weight"] }),
  field({ key: "jewelry.sizeWidth", label: "Size / width", type: "text", section: "specification", path: "jewelry.sizeWidth", categories: ["Jewelry"], aliases: ["size", "ring size", "width", "length"] }),
  field({ key: "jewelry.settingType", label: "Setting type", type: "select", section: "specification", path: "jewelry.settingType", categories: ["Jewelry"], source: list("settingTypes"), listMode: "open", aliases: ["setting", "setting type"] }),
  field({ key: "jewelry.hallmark", tier: "detail", label: "Hallmark", type: "text", section: "specification", path: "jewelry.hallmark", categories: ["Jewelry"], aliases: ["hallmark", "stamp"] }),
  field({ key: "jewelry.vendorStockNumber", tier: "detail", label: "Vendor stock #", type: "text", section: "specification", path: "jewelry.vendorStockNumber", categories: ["Jewelry"], aliases: ["vendor stock #", "vendor ref", "vendor style"] }),
  field({ key: "jewelry.totalDiamondCarats", label: "Total diamond weight", type: "number", min: 0, decimals: 3, unit: "ct", section: "specification", path: "jewelry.totalDiamondCarats", categories: ["Jewelry"], aliases: ["total diamond weight", "dia wt", "tdw", "diamond ct"] }),
  field({ key: "jewelry.totalGemCarats", tier: "detail", label: "Total gem weight", type: "number", min: 0, decimals: 3, unit: "ct", section: "specification", path: "jewelry.totalGemCarats", categories: ["Jewelry"], aliases: ["total gem weight", "gem wt", "color stone wt"] }),
  field({ key: "jewelry.metalCost", label: "Metal cost", ...PRICE, section: "pricing", path: "jewelry.metalCost", categories: ["Jewelry"], aliases: ["metal cost", "gold cost"] }),
  field({ key: "jewelry.jewelryExpense", label: "Making charges", ...PRICE, section: "pricing", path: "jewelry.jewelryExpense", categories: ["Jewelry"], aliases: ["making charges", "making charge", "labour", "labor", "jewelry expense"] }),
  field({ key: "jewelry.mountingSellPrice", tier: "detail", label: "Mounting sell price", ...PRICE, section: "pricing", path: "jewelry.mountingSellPrice", categories: ["Jewelry"], aliases: ["mounting price", "mounting sell price"] }),
  field({ key: "jewelry.tagPrice", tier: "detail", label: "Tag price", ...PRICE, section: "pricing", path: "jewelry.tagPrice", categories: ["Jewelry"], aliases: ["tag price", "mrp"] }),
  field({ key: "jewelry.retailPrice", label: "Retail price", ...PRICE, section: "pricing", path: "jewelry.retailPrice", categories: ["Jewelry"], aliases: ["retail price", "retail"] }),
  field({ key: "jewelry.markupPct", label: "Markup", ...PERCENT, min: 0, section: "pricing", path: "jewelry.markupPct", categories: ["Jewelry"], aliases: ["markup", "markup %"] }),
];

const WATCH: FieldDefinition[] = [
  field({ key: "watch.brand", label: "Brand", type: "select", section: "specification", path: "watch.brand", categories: ["Watch"], source: list("watchBrands"), required: true, aliases: ["brand", "make", "manufacturer"] }),
  field({ key: "watch.model", label: "Model", type: "text", section: "specification", path: "watch.model", categories: ["Watch"], aliases: ["model", "collection"] }),
  field({ key: "watch.referenceNumber", label: "Reference #", type: "text", section: "specification", path: "watch.referenceNumber", categories: ["Watch"], required: true, uppercase: true, aliases: ["reference", "reference #", "ref", "ref no"] }),
  field({ key: "watch.modelNumber", tier: "detail", label: "Model #", type: "text", section: "specification", path: "watch.modelNumber", categories: ["Watch"], uppercase: true, aliases: ["model #", "model no", "model number"] }),
  field({ key: "watch.serialNumber", label: "Serial #", type: "text", section: "specification", path: "watch.serialNumber", categories: ["Watch"], required: true, unique: "live", uppercase: true, aliases: ["serial", "serial #", "serial no", "case serial"] }),
  field({ key: "watch.gender", label: "Gender", type: "select", section: "specification", path: "watch.gender", categories: ["Watch"], source: options("Men's", "Women's", "Unisex"), aliases: ["gender"] }),
  field({ key: "watch.yearOfProduction", label: "Year", type: "integer", min: 1800, max: 2200, section: "specification", path: "watch.yearOfProduction", categories: ["Watch"], aliases: ["year", "year of production", "production year"] }),
  field({ key: "watch.caseMaterial", label: "Case material", type: "select", section: "specification", path: "watch.caseMaterial", categories: ["Watch"], source: list("watchCaseMaterials"), listMode: "open", aliases: ["case material", "case", "material"] }),
  field({ key: "watch.caseSizeMm", label: "Case size", ...MM, section: "specification", path: "watch.caseSizeMm", categories: ["Watch"], aliases: ["case size", "case diameter", "size"] }),
  field({ key: "watch.movement", label: "Movement", type: "select", section: "specification", path: "watch.movement", categories: ["Watch"], source: list("watchMovements"), listMode: "open", aliases: ["movement", "caliber"] }),
  field({ key: "watch.dial", tier: "detail", label: "Dial", type: "text", section: "specification", path: "watch.dial", categories: ["Watch"], aliases: ["dial", "dial color"] }),
  field({ key: "watch.bezel", tier: "detail", label: "Bezel", type: "text", section: "specification", path: "watch.bezel", categories: ["Watch"], aliases: ["bezel"] }),
  field({ key: "watch.bracelet", tier: "detail", label: "Bracelet", type: "text", section: "specification", path: "watch.bracelet", categories: ["Watch"], aliases: ["bracelet", "strap"] }),
  field({ key: "watch.diamondWeightCarats", tier: "detail", label: "Diamond weight", type: "number", min: 0, decimals: 3, unit: "ct", section: "specification", path: "watch.diamondWeightCarats", categories: ["Watch"], aliases: ["diamond weight", "dia wt"] }),
  field({ key: "watch.features", label: "Features", type: "multiselect", section: "specification", path: "watch.features", categories: ["Watch"], source: list("watchFeatures"), aliases: ["features", "complications"] }),
  field({ key: "watch.conditionGrade", label: "Condition", type: "select", section: "specification", path: "watch.conditionGrade", categories: ["Watch"], source: options("Unworn", "Excellent", "Very good", "Good"), required: true, aliases: ["condition", "grade"] }),
  field({ key: "watch.hasBox", label: "Box", type: "boolean", section: "specification", path: "watch.hasBox", categories: ["Watch"], aliases: ["box"] }),
  field({ key: "watch.hasPapers", label: "Papers", type: "boolean", section: "specification", path: "watch.hasPapers", categories: ["Watch"], aliases: ["papers", "card"] }),
  field({ key: "watch.warrantyCardDate", tier: "detail", label: "Warranty card date", type: "date", section: "specification", path: "watch.warrantyCardDate", categories: ["Watch"], aliases: ["warranty date", "card date", "warranty card date"] }),
  field({ key: "watch.basePrice", tier: "detail", label: "Base price", ...PRICE, section: "pricing", path: "watch.basePrice", categories: ["Watch"], aliases: ["base price"] }),
  field({ key: "watch.retailPrice", label: "Retail price", ...PRICE, section: "pricing", path: "watch.retailPrice", categories: ["Watch"], aliases: ["retail price", "retail", "msrp"] }),
  field({ key: "watch.ourPrice", tier: "detail", label: "Our price", ...PRICE, section: "pricing", path: "watch.ourPrice", categories: ["Watch"], aliases: ["our price"] }),
  field({ key: "watch.markupPct", label: "Markup", ...PERCENT, min: 0, section: "pricing", path: "watch.markupPct", categories: ["Watch"], aliases: ["markup", "markup %"] }),
];

/** India pack. Categories default to Jewelry; tenants can extend them to their own gold categories. */
const INDIA_PACK: FieldDefinition[] = [
  field({
    key: "in.huid",
    label: "HUID",
    type: "text",
    section: "market",
    path: "attributes.huid",
    categories: ["Jewelry"],
    pack: "IN",
    unique: "live",
    uppercase: true,
    pattern: { regex: "^[A-Z0-9]{6}$", message: "HUID is exactly 6 letters or digits" },
    help: "BIS Hallmark Unique ID, laser-marked on the piece.",
    aliases: ["huid", "hallmark uid", "hallmark unique id"],
  }),
  field({
    key: "in.makingChargeBasis",
    label: "Making charge basis",
    type: "select",
    section: "market",
    path: "attributes.makingChargeBasis",
    categories: ["Jewelry"],
    pack: "IN",
    source: options("Per gram", "% of metal value", "Flat per piece"),
    aliases: ["making charge basis", "mc basis", "making type"],
  }),
  field({ key: "in.makingChargeRate", label: "Making charge rate", type: "number", min: 0, decimals: 2, section: "market", path: "attributes.makingChargeRate", categories: ["Jewelry"], pack: "IN", aliases: ["making charge rate", "mc rate", "mc"] }),
  field({ key: "in.wastagePct", label: "Wastage", ...PERCENT, min: 0, max: 100, section: "market", path: "attributes.wastagePct", categories: ["Jewelry"], pack: "IN", aliases: ["wastage", "wastage %", "va", "value addition"] }),
];

export const BUILT_IN_FIELDS: FieldDefinition[] = [...COMMON, ...DIAMOND, ...JEWELRY, ...WATCH, ...INDIA_PACK];
