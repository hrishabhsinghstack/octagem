import { mockVendors } from "@/data/mockVendors";
import type { Vendor } from "@/types/party";

const STORAGE_KEY = "octagem.vendors.local";

function readAll(): Vendor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Vendor[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockVendors));
  return mockVendors;
}

function writeAll(vendors: Vendor[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vendors));
}

export function getAll(): Vendor[] {
  return readAll();
}

export function getById(id: string): Vendor | undefined {
  return readAll().find((v) => v.id === id);
}

export function insert(vendor: Vendor): Vendor {
  const vendors = readAll();
  vendors.unshift(vendor);
  writeAll(vendors);
  return vendor;
}

export function update(id: string, patch: Partial<Vendor>): Vendor | undefined {
  const vendors = readAll();
  const index = vendors.findIndex((v) => v.id === id);
  if (index === -1) return undefined;
  vendors[index] = { ...vendors[index], ...patch };
  writeAll(vendors);
  return vendors[index];
}

export function remove(id: string) {
  writeAll(readAll().filter((v) => v.id !== id));
}

export function nextVendorId(): string {
  const numbers = readAll().map((v) => Number(v.id.replace("V-", ""))).filter((n) => !Number.isNaN(n));
  return `V-${(numbers.length ? Math.max(...numbers) : 1000) + 1}`;
}
