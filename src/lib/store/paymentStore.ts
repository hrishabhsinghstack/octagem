import { mockPayments } from "@/data/mockPayments";
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
}

export function getAll(): Payment[] {
  return readAll();
}

export function listByInvoice(invoiceId: string): Payment[] {
  return readAll().filter((p) => p.invoiceId === invoiceId);
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
