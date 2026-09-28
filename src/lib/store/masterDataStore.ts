import type { LocationNode, MasterListEntry, MasterListKey } from "@/types/masterData";

const LIST_STORAGE_PREFIX = "octagem.masterdata.list.";
const LOCATION_STORAGE_KEY = "octagem.masterdata.locations";

let uid = 0;
const id = (prefix: string) => `${prefix}-${Date.now()}-${uid++}`;

const seedEntries = (labels: string[], scopeValue?: string): MasterListEntry[] =>
  labels.map((label, index) => ({ id: id("m"), label, active: true, sortOrder: index, scopeValue }));

const seedNumericEntries = (rows: [string, number][]): MasterListEntry[] =>
  rows.map(([label, numericValue], index) => ({ id: id("m"), label, active: true, sortOrder: index, numericValue }));

const DEFAULT_LISTS: Record<MasterListKey, () => MasterListEntry[]> = {
  diamondShapes: () => seedEntries(["Round", "Oval", "Cushion", "Emerald", "Pear", "Princess", "Marquise", "Radiant", "Asscher", "Heart"]),
  diamondColors: () => seedEntries("DEFGHIJKLMNOPQRSTUVWXYZ".split("")),
  diamondClarities: () => seedEntries(["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3", "VVS", "VS", "SI", "I"]),
  finishGrades: () => seedEntries(["Excellent", "Very Good", "Good", "Fair", "Poor"]),
  fluorescenceGrades: () => seedEntries(["None", "Faint", "Medium", "Strong", "Very Strong"]),
  certificationLabs: () => seedEntries(["GIA", "IGI", "HRD", "AGS", "EGL", "GCAL", "None"]),
  diamondTreatments: () => seedEntries(["None", "HPHT", "Laser Drilled", "Fracture Filled", "Irradiated", "Clarity Enhanced", "Mixed / Unassessed"]),
  fancyColorIntensities: () => seedEntries(["Faint", "Very Light", "Light", "Fancy Light", "Fancy", "Fancy Intense", "Fancy Vivid", "Fancy Deep", "Fancy Dark"]),
  metalTypes: () => seedEntries(["Gold", "Platinum", "Silver", "Palladium"]),
  metalKarats: () => [
    ...seedEntries(["24K", "22K", "18K", "14K", "10K"], "Gold"),
    ...seedEntries(["950 Platinum", "900 Platinum"], "Platinum"),
    ...seedEntries(["925 Sterling"], "Silver"),
    ...seedEntries(["950 Palladium"], "Palladium"),
  ],
  metalColors: () => seedEntries(["Yellow", "White", "Rose", "Two-tone"]),
  jewelryGroups: () => seedEntries(["Bridal", "Bracelets", "Pendants", "Bangles", "Earrings", "Necklaces"]),
  jewelrySubCategories: () => seedEntries(["Halo Ring", "Solitaire Ring", "Tennis Bracelet", "Solitaire Pendant", "Solid Bangle", "Stud Earrings"]),
  settingTypes: () => seedEntries(["Prong", "Bezel", "Pavé", "Channel", "Tension", "None"]),
  gemstoneTypes: () => seedEntries([
    "Diamond", "Ruby", "Sapphire", "Emerald", "Tanzanite", "Aquamarine", "Amethyst", "Topaz", "Pearl", "Opal", "Garnet", "Peridot", "Citrine", "Morganite", "Metal", "Finding",
  ]),
  watchBrands: () => seedEntries(["Rolex", "Omega", "Cartier", "Tudor", "Patek Philippe", "Audemars Piguet", "IWC", "Panerai"]),
  watchMovements: () => seedEntries(["Automatic", "Manual", "Quartz", "Automatic Chronometer", "Kinetic", "Solar"]),
  watchCaseMaterials: () => seedEntries(["Stainless Steel", "Yellow Gold", "White Gold", "Rose Gold", "Platinum", "Titanium", "Ceramic", "Two-tone"]),
  watchFeatures: () => seedEntries([
    "Chronograph", "GMT", "Date", "Day-Date", "Moonphase", "Power Reserve", "Tourbillon", "Perpetual Calendar", "World Timer", "Diver's Bezel",
  ]),
  shipViaMethods: () => seedEntries(["Hand delivery", "Brinks courier", "FedEx", "UPS", "Registered mail"]),
  paymentTerms: () => seedEntries(["Net 14 on conversion", "Net 21 on conversion", "Net 30 on conversion", "Due on conversion"]),
  taxRates: () => seedNumericEntries([
    ["Exempt (Resale Certificate)", 0],
    ["NY Sales Tax", 8.875],
    ["GST", 3],
  ]),
  currencies: () => seedNumericEntries([
    ["USD", 1],
    ["INR", 83.2],
    ["EUR", 0.92],
  ]),
};

function readList(key: MasterListKey): MasterListEntry[] {
  const storageKey = `${LIST_STORAGE_PREFIX}${key}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as MasterListEntry[];
  } catch {
    // fall through to reseed
  }
  // Lists without a product seed (tenant-defined, for tenant categories) start empty rather than crash.
  const seeded = DEFAULT_LISTS[key]?.() ?? [];
  localStorage.setItem(storageKey, JSON.stringify(seeded));
  return seeded;
}

function writeList(key: MasterListKey, entries: MasterListEntry[]) {
  localStorage.setItem(`${LIST_STORAGE_PREFIX}${key}`, JSON.stringify(entries));
}

export function getList(key: MasterListKey, activeOnly = true): MasterListEntry[] {
  const entries = readList(key).sort((a, b) => a.sortOrder - b.sortOrder);
  return activeOnly ? entries.filter((e) => e.active) : entries;
}

export function addListEntry(key: MasterListKey, label: string, scopeValue?: string, numericValue?: number): MasterListEntry {
  const entries = readList(key);
  const entry: MasterListEntry = { id: id("m"), label: label.trim(), active: true, sortOrder: entries.length, scopeValue, numericValue };
  entries.push(entry);
  writeList(key, entries);
  return entry;
}

export function updateListEntry(key: MasterListKey, entryId: string, patch: Partial<MasterListEntry>) {
  const entries = readList(key);
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return;
  entries[index] = { ...entries[index], ...patch };
  writeList(key, entries);
}

export function deleteListEntry(key: MasterListKey, entryId: string) {
  writeList(key, readList(key).filter((e) => e.id !== entryId));
}

/* ------------------------------------------------------------------ locations */

function seedLocationTree(): LocationNode[] {
  const nodes: LocationNode[] = [];
  let sortOrder = 0;
  const add = (label: string, parentId: string | null): string => {
    const nodeId = id("loc");
    nodes.push({ id: nodeId, label, parentId, active: true, sortOrder: sortOrder++ });
    return nodeId;
  };

  const newYork = add("New York", null);
  const vaultA = add("Vault A", newYork);
  add("Tray 3", vaultA);
  add("Tray 5", vaultA);
  const receiving = add("Receiving", newYork);
  add("Inspection", receiving);
  add("Return inspection", receiving);
  const showroom = add("Showroom", newYork);
  add("Case 2", showroom);
  add("Case 6", showroom);

  return nodes;
}

function readLocations(): LocationNode[] {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocationNode[];
  } catch {
    // fall through to reseed
  }
  const seeded = seedLocationTree();
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeLocations(nodes: LocationNode[]) {
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nodes));
}

export function getLocationTree(): LocationNode[] {
  return readLocations().sort((a, b) => a.sortOrder - b.sortOrder);
}

export function addLocationNode(parentId: string | null, label: string): LocationNode {
  const nodes = readLocations();
  const siblingCount = nodes.filter((n) => n.parentId === parentId).length;
  const node: LocationNode = { id: id("loc"), label: label.trim(), parentId, active: true, sortOrder: siblingCount };
  nodes.push(node);
  writeLocations(nodes);
  return node;
}

export function updateLocationNode(nodeId: string, patch: Partial<LocationNode>) {
  const nodes = readLocations();
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index === -1) return;
  nodes[index] = { ...nodes[index], ...patch };
  writeLocations(nodes);
}

/** Deletes a node and everything beneath it. */
export function deleteLocationNode(nodeId: string) {
  const nodes = readLocations();
  const toRemove = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && toRemove.has(node.parentId) && !toRemove.has(node.id)) {
        toRemove.add(node.id);
        changed = true;
      }
    }
  }
  writeLocations(nodes.filter((n) => !toRemove.has(n.id)));
}

/** Full breadcrumb path for a leaf node, e.g. "New York › Vault A › Tray 3" — this is what an item's `location` field stores. */
export function getLocationPath(nodeId: string): string {
  const nodes = readLocations();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  let current = byId.get(nodeId);
  while (current) {
    parts.unshift(current.label);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" › ");
}

/** Every node paired with its full breadcrumb path, for populating a flat location picker. */
export function listLocationPaths(activeOnly = true): { id: string; path: string }[] {
  const nodes = getLocationTree().filter((n) => !activeOnly || n.active);
  return nodes.map((n) => ({ id: n.id, path: getLocationPath(n.id) }));
}
