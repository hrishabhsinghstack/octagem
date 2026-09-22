import { mockInvoices } from "@/data/mockInvoices";
import type { Invoice } from "@/types/invoice";

const STORAGE_KEY = "octagem.invoices.local";

function migrate(invoices: Invoice[]): { invoices: Invoice[]; changed: boolean } {
  let changed = false;
  const migrated = invoices.map((invoice) => {
    if (invoice.currency) return invoice;
    changed = true;
    return { ...invoice, currency: "USD", fxRateToBase: 1 };
  });
  return { invoices: migrated, changed };
}

function readAll(): Invoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { invoices, changed } = migrate(JSON.parse(raw) as Invoice[]);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
      return invoices;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockInvoices));
  return mockInvoices;
}

function writeAll(invoices: Invoice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
}

export function getAll(): Invoice[] {
  return readAll();
}

export function getById(id: string): Invoice | undefined {
  return readAll().find((i) => i.id === id);
}

export function insert(invoice: Invoice): Invoice {
  const invoices = readAll();
  invoices.unshift(invoice);
  writeAll(invoices);
  return invoice;
}

export function update(id: string, patch: Partial<Invoice>): Invoice | undefined {
  const invoices = readAll();
  const index = invoices.findIndex((i) => i.id === id);
  if (index === -1) return undefined;
  invoices[index] = { ...invoices[index], ...patch };
  writeAll(invoices);
  return invoices[index];
}

export function nextInvoiceId(): string {
  const numbers = readAll().map((i) => Number(i.id.replace("INV-", ""))).filter((n) => !Number.isNaN(n));
  return `INV-${(numbers.length ? Math.max(...numbers) : 3000) + 1}`;
}
