import type { CategoryDefinition } from "@/types/catalog";

/**
 * Suggests the next stock number for a category from the codes already in use — no stored counter,
 * so nothing can drift out of sync with the actual stock (deleted items, imports, manual codes).
 */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatStockNumber(category: Pick<CategoryDefinition, "stockPrefix" | "stockPadding">, value: number): string {
  const digits = category.stockPadding > 0 ? String(value).padStart(category.stockPadding, "0") : String(value);
  return `${category.stockPrefix}${digits}`.toUpperCase();
}

export function nextStockNumber(category: Pick<CategoryDefinition, "stockPrefix" | "stockPadding" | "stockStartNumber">, existingCodes: string[]): string {
  const pattern = new RegExp(`^${escapeRegex(category.stockPrefix.toUpperCase())}(\\d+)$`);
  const taken = new Set(existingCodes.map((code) => code.trim().toUpperCase()));
  let highest = category.stockStartNumber - 1;
  for (const code of taken) {
    const match = code.match(pattern);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  let candidate = highest + 1;
  // Padding can make a formatted candidate collide with a differently-padded manual code; step past it.
  while (taken.has(formatStockNumber(category, candidate))) candidate++;
  return formatStockNumber(category, candidate);
}
