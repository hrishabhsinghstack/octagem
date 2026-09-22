import { mockQuotes } from "@/data/mockQuotes";
import type { Quote } from "@/types/quote";

const STORAGE_KEY = "octagem.quotes.local";

/** Backfills currency/fxRateToBase for records created before those fields existed. */
function migrate(quotes: Quote[]): { quotes: Quote[]; changed: boolean } {
  let changed = false;
  const migrated = quotes.map((quote) => {
    if (quote.currency) return quote;
    changed = true;
    return { ...quote, currency: "USD", fxRateToBase: 1 };
  });
  return { quotes: migrated, changed };
}

function readAll(): Quote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { quotes, changed } = migrate(JSON.parse(raw) as Quote[]);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
      return quotes;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockQuotes));
  return mockQuotes;
}

function writeAll(quotes: Quote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
}

export function getAll(): Quote[] {
  return readAll();
}

export function getById(id: string): Quote | undefined {
  return readAll().find((q) => q.id === id);
}

export function insert(quote: Quote): Quote {
  const quotes = readAll();
  quotes.unshift(quote);
  writeAll(quotes);
  return quote;
}

export function update(id: string, patch: Partial<Quote>): Quote | undefined {
  const quotes = readAll();
  const index = quotes.findIndex((q) => q.id === id);
  if (index === -1) return undefined;
  quotes[index] = { ...quotes[index], ...patch };
  writeAll(quotes);
  return quotes[index];
}

export function nextQuoteId(): string {
  const numbers = readAll().map((q) => Number(q.id.replace("Q-", ""))).filter((n) => !Number.isNaN(n));
  return `Q-${(numbers.length ? Math.max(...numbers) : 4000) + 1}`;
}
