import type { Quote } from "@/types/quote";

/** Expired is informational, not blocking — an Open quote past its expiry can still be accepted or declined manually. */
export function isQuoteExpired(quote: Pick<Quote, "status" | "expiresAt">): boolean {
  return quote.status === "Open" && new Date(`${quote.expiresAt}T00:00:00`).getTime() < Date.now();
}
