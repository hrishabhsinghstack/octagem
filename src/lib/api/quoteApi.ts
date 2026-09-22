import { createSalesOrder } from "@/lib/api/salesOrderApi";
import { getCurrentFxRate } from "@/lib/currency";
import * as store from "@/lib/store/quoteStore";
import type { Quote, QuoteLine } from "@/types/quote";

export async function listQuotes(): Promise<Quote[]> {
  return [...store.getAll()];
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  return store.getById(id);
}

export interface CreateQuotePayload {
  customerId: string;
  salesperson: string;
  notes: string;
  expiresAt: string;
  currency: string;
  taxRateId?: string;
  lines: Omit<QuoteLine, "id">[];
}

export async function createQuote(payload: CreateQuotePayload): Promise<Quote> {
  const id = store.nextQuoteId();
  const quote: Quote = {
    id,
    customerId: payload.customerId,
    salesperson: payload.salesperson,
    notes: payload.notes,
    issuedAt: new Date().toISOString().slice(0, 10),
    expiresAt: payload.expiresAt,
    status: "Open",
    currency: payload.currency,
    fxRateToBase: getCurrentFxRate(payload.currency),
    taxRateId: payload.taxRateId,
    lines: payload.lines.map((line, index) => ({ ...line, id: `${id}-L${index + 1}` })),
  };
  return store.insert(quote);
}

/** Accepting a quote is the only path to a Sales Order when the Quote step is turned on (§13.7's "conversion is the only path" pattern, mirrored here). The Sales Order inherits the Quote's already-struck currency/rate rather than looking up a fresh one. */
export async function acceptQuote(id: string): Promise<Quote | undefined> {
  const quote = store.getById(id);
  if (!quote) return undefined;

  const order = await createSalesOrder({
    customerId: quote.customerId,
    salesperson: quote.salesperson,
    sourceQuoteId: quote.id,
    currency: quote.currency,
    fxRateToBase: quote.fxRateToBase,
    lines: quote.lines.map((line) => ({ itemId: line.itemId, priceBasis: line.priceBasis, quantity: line.quantity, lineTotal: line.lineTotal })),
  });

  return store.update(id, { status: "Accepted", salesOrderId: order.id });
}

export async function declineQuote(id: string): Promise<Quote | undefined> {
  return store.update(id, { status: "Declined" });
}
