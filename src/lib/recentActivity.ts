export type RecentActivityType = "inventory" | "quote" | "salesOrder" | "invoice" | "purchaseOrder" | "vendorBill" | "memo" | "memoIn" | "customer" | "vendor";

export interface RecentActivityEntry {
  type: RecentActivityType;
  id: string;
  label: string;
  sublabel?: string;
  path: string;
  at: string;
}

const STORAGE_KEY = "octagem.recentActivity";
const MAX_ENTRIES = 12;

/** Per-viewer convenience only — never read back by business logic, safe to lose silently if storage is unavailable. */
export function recordRecentActivity(entry: Omit<RecentActivityEntry, "at">) {
  try {
    const existing = readRecentActivity().filter((e) => !(e.type === entry.type && e.id === entry.id));
    const next: RecentActivityEntry[] = [{ ...entry, at: new Date().toISOString() }, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — recent activity is a convenience, not critical state
  }
}

export function readRecentActivity(): RecentActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentActivityEntry[]) : [];
  } catch {
    return [];
  }
}
