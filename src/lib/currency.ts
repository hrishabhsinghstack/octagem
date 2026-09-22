import { getList } from "@/lib/store/masterDataStore";

/**
 * Convention (stated once, used everywhere): a currency's rate is "units of that currency equal
 * to 1 unit of the tenant's base currency" — e.g. base USD, INR rate 83.2 means 1 USD = 83.2 INR.
 * The base currency's own rate is always 1. See types/masterData.ts's MasterListEntry.numericValue
 * doc comment, and the "currencies" master list (Settings → Master Data).
 */
export function convertToBase(amount: number, fxRateToBase: number): number {
  if (!fxRateToBase) return amount;
  return amount / fxRateToBase;
}

/** Looks up a currency's current admin-maintained rate by its ISO code (the master list's label). Falls back to 1 if not found. */
export function getCurrentFxRate(currencyCode: string): number {
  const entry = getList("currencies").find((c) => c.label === currencyCode);
  return entry?.numericValue ?? 1;
}

/** Looks up a tax rate's percentage by its "taxRates" master list entry id. Falls back to 0 (no tax) if unset or not found. */
export function getTaxRatePercent(taxRateId: string | undefined): number {
  if (!taxRateId) return 0;
  const entry = getList("taxRates", false).find((t) => t.id === taxRateId);
  return entry?.numericValue ?? 0;
}
