import type { VendorPayment } from "@/types/vendorPayment";

const STORAGE_KEY = "octagem.vendorPayments.local";

function readAll(): VendorPayment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as VendorPayment[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  return [];
}

function writeAll(payments: VendorPayment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
}

export function getAll(): VendorPayment[] {
  return readAll();
}

export function listByVendorBill(vendorBillId: string): VendorPayment[] {
  return readAll().filter((p) => p.vendorBillId === vendorBillId);
}

export function insert(payment: VendorPayment): VendorPayment {
  const payments = readAll();
  payments.unshift(payment);
  writeAll(payments);
  return payment;
}

export function nextVendorPaymentId(): string {
  const numbers = readAll().map((p) => Number(p.id.replace("VPMT-", ""))).filter((n) => !Number.isNaN(n));
  return `VPMT-${(numbers.length ? Math.max(...numbers) : 9000) + 1}`;
}
