import type { FieldDefinition, FieldValue } from "@/types/catalog";
import type { InventoryItem } from "@/types/inventory";

/**
 * Turns raw input — a form keystroke or a spreadsheet cell — into a clean, typed field value, or
 * a precise error. The intake form and the import validator both go through here, so a value the
 * form accepts is exactly a value the import accepts. Pure: no storage, no React.
 */

export type DateOrder = "DMY" | "MDY";

export type CoerceResult = { ok: true; value: FieldValue | undefined } | { ok: false; error: string; suggestion?: string };

export function isBlank(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === "string") return raw.trim() === "";
  if (Array.isArray(raw)) return raw.length === 0;
  return false;
}

/**
 * Lower-cases and strips spaces and separators, so "VS-1", "vs 1" and "VS1" compare equal — and so do
 * location paths written with different separators ("New York · Vault A" vs "New York › Vault A").
 */
export function normaliseToken(value: string): string {
  return value.toLowerCase().replace(/[\s\-_./·›>|]+/g, "");
}

const UNIT_SUFFIX = /\s*(cts?|carats?|grams?|gms?|gm|g|mm|%)\s*$/i;

/**
 * Tolerant number parsing: currency symbols, thousands separators in any grouping (1,234,567 or
 * 12,34,567), spaces, accounting-style negatives "(1,200)", and a trailing unit ("1.52 ct").
 */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1).trim();
  }
  text = text.replace(UNIT_SUFFIX, "").replace(/^(?:[$₹€£]|rs\.?|inr|usd|eur|gbp)\s*/i, "").replace(/[\s,]/g, "");
  if (!/^\d*\.?\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

const TRUE_WORDS = new Set(["yes", "y", "true", "1", "✓", "x"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", ""]);

export function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1 ? true : raw === 0 ? false : null;
  if (typeof raw !== "string") return null;
  const word = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoIfValid(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null; // rejects 31 Feb and friends
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parses to an ISO date (yyyy-mm-dd). Accepts ISO, year-first, day/month-first per the tenant's
 * `dateOrder` (US sheets are MDY, Indian and most others DMY), and Excel serial day numbers.
 */
export function parseDate(raw: unknown, dateOrder: DateOrder): string | null {
  if (raw instanceof Date) {
    // Spreadsheet libraries hand back date cells as UTC midnight; local getters would shift the day
    // back by one for anyone west of UTC (New York), so read the calendar date in UTC.
    return isNaN(raw.getTime()) ? null : isoIfValid(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") {
    // Excel serial: day 1 = 1900-01-01, with Excel's fictitious 29 Feb 1900 (hence epoch 1899-12-30).
    if (!Number.isInteger(raw) || raw < 1 || raw > 2958465) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
    return isoIfValid(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  const yearFirst = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (yearFirst) return isoIfValid(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  const yearLast = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (yearLast) {
    const [a, b, year] = [Number(yearLast[1]), Number(yearLast[2]), Number(yearLast[3])];
    return dateOrder === "DMY" ? isoIfValid(year, b, a) : isoIfValid(year, a, b);
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** "rnd" inside "round": same first letter, remaining letters in order — how dealers abbreviate. */
function isAbbreviation(short: string, long: string): boolean {
  if (short.length < 3 || short.length >= long.length || short[0] !== long[0]) return false;
  let i = 0;
  for (const char of long) if (char === short[i]) i++;
  return i === short.length;
}

/** Closest option for a "did you mean" hint, or undefined when nothing is plausibly close. */
export function suggestOption(raw: string, options: string[]): string | undefined {
  const target = normaliseToken(raw);
  if (!target) return undefined;
  let best: { option: string; distance: number } | undefined;
  for (const option of options) {
    const candidate = normaliseToken(option);
    // A typed abbreviation ("Cush", "Plat") is a strong signal; anything shorter than 3 characters is too ambiguous to count.
    const distance = target.length >= 3 && candidate.startsWith(target) ? 0 : isAbbreviation(target, candidate) ? 1 : levenshtein(target, candidate);
    if (!best || distance < best.distance) best = { option, distance };
  }
  if (!best) return undefined;
  const tolerance = Math.max(1, Math.floor(target.length / 3));
  return best.distance <= tolerance ? best.option : undefined;
}

/** The one wording for "value not in the list" — import groups these by value so each is fixed once. */
export function notInListMessage(value: string): string {
  return `"${value}" is not an allowed value`;
}

/** The offending value, if `message` is a not-in-list error (see notInListMessage). */
export function parseNotInList(message: string): string | undefined {
  return message.match(/^"(.*)" is not an allowed value$/)?.[1];
}

/** Spellings of "nothing" that mean the list's own "None" entry, when it has one. */
const NONE_SYNONYMS = new Set(["none", "na", "nil", "nill", "no", "0", ""]);

function exactOption(raw: string, options: string[]): string | undefined {
  const token = normaliseToken(raw);
  const direct = options.find((option) => normaliseToken(option) === token);
  if (direct) return direct;
  if (NONE_SYNONYMS.has(token) || raw.trim() === "-") return options.find((option) => normaliseToken(option) === "none");
  return undefined;
}

/**
 * Matches a raw value to one of the allowed options, returning the option's canonical spelling.
 * With `allowRange`, "g-h" / "G – H" / "SI1 to SI2" resolve to "G-H" / "SI1-SI2" when both ends are
 * valid options — parcels and mounted melee are graded in ranges.
 */
export function matchOption(raw: string, options: string[], allowRange = false): CoerceResult {
  const exact = exactOption(raw, options);
  if (exact) return { ok: true, value: exact };
  if (allowRange) {
    const parts = raw.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
    if (parts.length === 2) {
      const from = exactOption(parts[0], options);
      const to = exactOption(parts[1], options);
      if (from && to && from !== to) return { ok: true, value: `${from}-${to}` };
    }
  }
  const suggestion = suggestOption(raw, options);
  return { ok: false, error: notInListMessage(raw.trim()), suggestion };
}

export interface CoerceContext {
  /** Allowed values for select/multiselect fields, already resolved from master data. */
  options?: string[];
  dateOrder: DateOrder;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

export function coerceValue(field: FieldDefinition, raw: unknown, context: CoerceContext): CoerceResult {
  if (isBlank(raw)) return { ok: true, value: undefined };

  switch (field.type) {
    case "text": {
      let text = String(raw).trim().replace(/\s+/g, " ");
      if (field.uppercase) text = text.toUpperCase();
      if (field.pattern && !new RegExp(field.pattern.regex).test(text)) return { ok: false, error: field.pattern.message };
      return { ok: true, value: text };
    }
    case "number":
    case "integer": {
      const value = parseNumber(raw);
      if (value === null) return { ok: false, error: `"${String(raw).trim()}" is not a number` };
      if (field.type === "integer" && !Number.isInteger(value)) return { ok: false, error: "Must be a whole number" };
      // Rounding a carat weight or a price silently would change what the business owns; reject instead.
      if (field.decimals !== undefined && decimalPlaces(value) > field.decimals) {
        return { ok: false, error: `At most ${field.decimals} decimal place${field.decimals === 1 ? "" : "s"}` };
      }
      if (field.min !== undefined && value < field.min) return { ok: false, error: `Must be at least ${field.min}` };
      if (field.max !== undefined && value > field.max) return { ok: false, error: `Must be at most ${field.max}` };
      return { ok: true, value };
    }
    case "date": {
      const value = parseDate(raw, context.dateOrder);
      if (!value) return { ok: false, error: `"${String(raw).trim()}" is not a valid date (use ${context.dateOrder === "DMY" ? "DD/MM/YYYY" : "MM/DD/YYYY"} or YYYY-MM-DD)` };
      return { ok: true, value };
    }
    case "boolean": {
      const value = parseBoolean(raw);
      if (value === null) return { ok: false, error: `"${String(raw).trim()}" is not Yes or No` };
      return { ok: true, value };
    }
    case "select": {
      const match = matchOption(String(raw), context.options ?? [], field.allowRange);
      if (match.ok || field.listMode !== "open") return match;
      return { ok: true, value: String(raw).trim().replace(/\s+/g, " ") };
    }
    case "multiselect": {
      const parts = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;|]/);
      const values: string[] = [];
      for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
        const match = matchOption(part, context.options ?? []);
        if (!match.ok && field.listMode !== "open") return match;
        const value = match.ok ? (match.value as string) : part;
        if (!values.includes(value)) values.push(value);
      }
      return { ok: true, value: values.length ? values : undefined };
    }
  }
}

export interface ValidationOutcome {
  values: Record<string, FieldValue>;
  errors: Record<string, string>;
  suggestions: Record<string, string>;
}

/**
 * Validates a whole record keyed by field key. `optionsFor` receives the values coerced so far so
 * a scoped list (karat filtered by metal) can see its parent — parents are resolved first.
 */
export function validateValues(
  fields: FieldDefinition[],
  raw: Record<string, unknown>,
  optionsFor: (field: FieldDefinition, resolved: Record<string, FieldValue>) => string[] | undefined,
  dateOrder: DateOrder
): ValidationOutcome {
  const outcome: ValidationOutcome = { values: {}, errors: {}, suggestions: {} };
  const scoped = (field: FieldDefinition) => field.source?.kind === "masterList" && Boolean(field.source.scopedByField);
  const ordered = [...fields.filter((f) => !scoped(f)), ...fields.filter(scoped)];

  for (const field of ordered) {
    const value = raw[field.key];
    if (isBlank(value)) {
      if (field.required) outcome.errors[field.key] = `${field.label} is required`;
      continue;
    }
    const options = field.type === "select" || field.type === "multiselect" ? optionsFor(field, outcome.values) : undefined;
    const result = coerceValue(field, value, { options, dateOrder });
    if (result.ok) {
      if (result.value !== undefined) outcome.values[field.key] = result.value;
    } else {
      outcome.errors[field.key] = result.error;
      if (result.suggestion) outcome.suggestions[field.key] = result.suggestion;
    }
  }
  return outcome;
}

/* ---------------------------------------------------------------- item paths */

export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Immutable set: returns a copy of `target` with the value at `path` replaced, creating objects on the way. */
export function setPath<T extends object>(target: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const record = target as Record<string, unknown>;
  if (rest.length === 0) return { ...record, [head]: value } as T;
  const child = record[head];
  const base = child !== null && typeof child === "object" ? (child as object) : {};
  return { ...record, [head]: setPath(base, rest.join("."), value) } as T;
}

/**
 * Immutable delete: removes the key at `path` and prunes nested objects left empty, so clearing a
 * fancy-color intensity leaves no `fancyColor: {}` shell for readers to trip on. Missing branches
 * are a no-op. The root object itself is never removed.
 */
export function unsetPath<T extends object>(target: T, path: string): T {
  const [head, ...rest] = path.split(".");
  const record = target as Record<string, unknown>;
  if (!(head in record)) return target;
  if (rest.length === 0) {
    const { [head]: _removed, ...remaining } = record;
    return remaining as T;
  }
  const child = record[head];
  if (child === null || typeof child !== "object") return target;
  const nextChild = unsetPath(child as object, rest.join("."));
  if (nextChild === child) return target;
  if (Object.keys(nextChild).length === 0) {
    const { [head]: _removed, ...remaining } = record;
    return remaining as T;
  }
  return { ...record, [head]: nextChild } as T;
}

/* ---------------------------------------------------------------- uniqueness */

const TERMINAL_STATUSES = new Set(["Sold", "Returned to vendor"]);

export interface UniqueConflict {
  fieldKey: string;
  message: string;
  conflictingItemId: string;
}

/**
 * Checks `unique` fields against existing stock. `excludeId` skips the item being edited. Values
 * that mean "nothing" (blank, None, N/A) never conflict — uncertified stones all share them.
 */
export function findUniqueConflicts(fields: FieldDefinition[], values: Record<string, FieldValue>, items: InventoryItem[], excludeId?: string): UniqueConflict[] {
  const conflicts: UniqueConflict[] = [];
  for (const field of fields) {
    if (!field.unique) continue;
    const value = values[field.key];
    if (isBlank(value) || typeof value === "boolean" || Array.isArray(value)) continue;
    const token = normaliseToken(String(value));
    if (NONE_SYNONYMS.has(token)) continue;
    const clash = items.find((item) => {
      if (item.id === excludeId) return false;
      if (field.unique === "live" && TERMINAL_STATUSES.has(item.status)) return false;
      const existing = getPath(item, field.path);
      return existing !== undefined && existing !== null && normaliseToken(String(existing)) === token;
    });
    if (clash) conflicts.push({ fieldKey: field.key, message: `${field.label} "${value}" is already used by ${clash.code}`, conflictingItemId: clash.id });
  }
  return conflicts;
}
