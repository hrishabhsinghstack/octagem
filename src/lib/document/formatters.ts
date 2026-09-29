import type { DocumentFormatters } from "@/lib/document/renderDocument";
import { formatCurrency, formatDateShort } from "@/lib/utils";

/**
 * The app's real formatters, wired to the tenant's stored locale settings.
 *
 * They live here rather than inside renderDocument because formatCurrency reads localStorage via
 * getNumberLocale() — pulling that into the engine would make a pure module depend on global state and
 * make test output locale-dependent. The engine takes formatters as a parameter; this is the one place
 * the real ones are assembled.
 */
export const appFormatters: DocumentFormatters = {
  currency: (value, currency) => formatCurrency(value, currency),
  number: (value, decimals) =>
    // `decimals` is a maximum, not a fixed count — a 1.5 ct stone prints "1.5", not "1.500".
    decimals === undefined ? String(value) : String(Number(value.toFixed(decimals))),
  date: (iso) => formatDateShort(iso),
};
