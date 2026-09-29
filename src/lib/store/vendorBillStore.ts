import { notifyDataChanged } from "@/lib/store/changes";
import type { VendorBill } from "@/types/vendorBill";

const STORAGE_KEY = "octagem.vendorBills.local";

function readAll(): VendorBill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as VendorBill[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  return [];
}

function writeAll(bills: VendorBill[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
  notifyDataChanged();
}

export function getAll(): VendorBill[] {
  return readAll();
}

export function getById(id: string): VendorBill | undefined {
  return readAll().find((b) => b.id === id);
}

export function insert(bill: VendorBill): VendorBill {
  const bills = readAll();
  bills.unshift(bill);
  writeAll(bills);
  return bill;
}

export function update(id: string, patch: Partial<VendorBill>): VendorBill | undefined {
  const bills = readAll();
  const index = bills.findIndex((b) => b.id === id);
  if (index === -1) return undefined;
  bills[index] = { ...bills[index], ...patch };
  writeAll(bills);
  return bills[index];
}

export function nextVendorBillId(): string {
  const numbers = readAll().map((b) => Number(b.id.replace("VB-", ""))).filter((n) => !Number.isNaN(n));
  return `VB-${(numbers.length ? Math.max(...numbers) : 8000) + 1}`;
}
