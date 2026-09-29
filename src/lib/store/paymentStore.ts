import { mockPayments } from "@/data/mockPayments";
import { notifyDataChanged } from "@/lib/store/changes";
import type { Payment } from "@/types/payment";

const STORAGE_KEY = "octagem.payments.local";

function readAll(): Payment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Payment[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockPayments));
  return mockPayments;
}

function writeAll(payments: Payment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
  notifyDataChanged();
}

export function getAll(): Payment[] {
  return readAll();
}

export function listByInvoice(invoiceId: string): Payment[] {
  return readAll().filter((p) => p.invoiceId === invoiceId);
}

export function getById(id: string): Payment | undefined {
  return readAll().find((p) => p.id === id);
}

/**
 * Only ever used to record clearing. A payment's amount, invoice and date are immutable once written —
 * correcting one means reversing it, which the allocation model will bring.
 */
export function update(id: string, patch: Partial<Payment>): Payment | undefined {
  const payments = readAll();
  const index = payments.findIndex((p) => p.id === id);
  if (index === -1) return undefined;
  payments[index] = { ...payments[index], ...patch };
  writeAll(payments);
  return payments[index];
}

export function insert(payment: Payment): Payment {
  const payments = readAll();
  payments.unshift(payment);
  writeAll(payments);
  return payment;
}

export function nextPaymentId(): string {
  const numbers = readAll().map((p) => Number(p.id.replace("PMT-", ""))).filter((n) => !Number.isNaN(n));
  return `PMT-${(numbers.length ? Math.max(...numbers) : 6000) + 1}`;
}
