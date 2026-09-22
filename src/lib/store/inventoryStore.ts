import { mockInventory } from "@/data/mockInventory";
import type { InventoryItem, LedgerEntry } from "@/types/inventory";

/**
 * localStorage-backed, seeded from the mock data on first load. No backend exists yet
 * (OCTAGEM-BLUEPRINT.md §38), so this is a stand-in for the real stock ledger — every write
 * goes through `appendLedger` so item history stays honest, matching §7.3's "nothing mutates
 * without a movement" rule even in this mock form. Swap this file's body for real API calls
 * once the backend exists; callers (inventoryApi.ts) do not change.
 */
const STORAGE_KEY = "octagem.inventory.local";

/** Backfills fields added after a record was first persisted, so old localStorage data doesn't crash newer code. */
function migrate(items: InventoryItem[]): { items: InventoryItem[]; changed: boolean } {
  let changed = false;
  const migrated = items.map((item) => {
    let next = item;
    if (!next.media) {
      changed = true;
      next = { ...next, media: [] };
    }
    if (!next.ownership) {
      changed = true;
      next = { ...next, ownership: "OWNED" };
    }
    return next;
  });
  return { items: migrated, changed };
}

function readAll(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { items, changed } = migrate(JSON.parse(raw) as InventoryItem[]);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return items;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockInventory));
  return mockInventory;
}

export class InventoryStorageError extends Error {}

function writeAll(items: InventoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    throw new InventoryStorageError("Browser storage is full. Remove an unused photo elsewhere and try again.");
  }
}

export function getAll(): InventoryItem[] {
  return readAll();
}

export function getById(id: string): InventoryItem | undefined {
  return readAll().find((item) => item.id === id);
}

export function insert(item: InventoryItem): InventoryItem {
  const items = readAll();
  items.unshift(item);
  writeAll(items);
  return item;
}

export function update(id: string, patch: Partial<InventoryItem>, ledgerEntry?: Omit<LedgerEntry, "id">): InventoryItem | undefined {
  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return undefined;

  const current = items[index];
  const ledger = ledgerEntry ? [{ ...ledgerEntry, id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...current.ledger] : current.ledger;
  const updated: InventoryItem = { ...current, ...patch, ledger };
  items[index] = updated;
  writeAll(items);
  return updated;
}

export function remove(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function resetToSeed() {
  writeAll(mockInventory);
}
