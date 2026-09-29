import { mockInvoices } from "@/data/mockInvoices";
import { notifyDataChanged } from "@/lib/store/changes";
import type { Invoice } from "@/types/invoice";

const STORAGE_KEY = "octagem.invoices.local";

/** Backfills fields added after a record was first persisted, so old localStorage data doesn't crash newer code. */
function migrate(invoices: Invoice[]): { invoices: Invoice[]; changed: boolean } {
  let changed = false;
  const migrated = invoices.map((invoice) => {
    let next = invoice;
    if (!next.currency) {
      changed = true;
      next = { ...next, currency: "USD", fxRateToBase: 1 };
    }
    // `sends` predates nothing but is read unguarded (invoice.sends.length), so it must always be an array.
    if (!Array.isArray(next.sends)) {
      changed = true;
      next = { ...next, sends: [] };
    }
    return next;
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
  notifyDataChanged();
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

/** Only ever called for a Draft — see invoiceApi.deleteDraftInvoice. Issued invoices are voided, not removed. */
export function remove(id: string) {
  writeAll(readAll().filter((i) => i.id !== id));
}

export function nextInvoiceId(): string {
  const numbers = readAll().map((i) => Number(i.id.replace("INV-", ""))).filter((n) => !Number.isNaN(n));
  return `INV-${(numbers.length ? Math.max(...numbers) : 3000) + 1}`;
}
