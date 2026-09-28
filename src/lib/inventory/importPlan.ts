import { itemToValues, sameRaw, validateForm, type RawValues } from "@/lib/inventory/catalogForm";
import { findUniqueConflicts, isBlank, normaliseToken, parseNotInList, type DateOrder } from "@/lib/inventory/fieldValues";
import { headerLookup, isFieldVisible } from "@/lib/inventory/registry";
import { nextStockNumber } from "@/lib/inventory/stockNumber";
import type { CategoryDefinition, FieldDefinition, FieldValue } from "@/types/catalog";
import type { InventoryItem } from "@/types/inventory";

/**
 * Spreadsheet import, as pure functions: parse → detect header → map columns → plan every row.
 * Rows are validated by the same catalog rules the receive form uses (lib/inventory/catalogForm),
 * so "the import accepted it" and "the form would have accepted it" are the same statement.
 * Nothing here writes; the plan is committed by inventoryApi.commitImport.
 */

/** Pseudo field key for a column that says which category a row belongs to. */
export const CATEGORY_COLUMN = "__category__";

/* ---------------------------------------------------------------- parsing */

/** Tab if any line has one (pasted from Excel), else semicolon if it outnumbers commas (European CSV), else comma. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  if (sample.includes("\t")) return "\t";
  const semicolons = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/** RFC-4180-style parsing: quoted fields, doubled quotes, delimiters and newlines inside quotes, BOM. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "Carat (ct) *" → the token for "Carat": strips the required marker and a trailing unit. */
export function normaliseHeader(header: unknown): string {
  return normaliseToken(
    String(header ?? "")
      .replace(/\*/g, "")
      .replace(/\([^)]*\)\s*$/, "")
      .trim()
  );
}

/**
 * Tokens to look a header up by, most specific first: the header as written (so a label that
 * itself contains brackets, like "Depth (mm)", matches exactly), then without a trailing unit.
 */
function headerTokens(header: unknown): string[] {
  const full = normaliseToken(String(header ?? "").replace(/\*/g, "").trim());
  const stripped = normaliseHeader(header);
  return full === stripped ? [full] : [full, stripped];
}

function lookupHeader(lookup: Map<string, string>, header: unknown): string | undefined {
  for (const token of headerTokens(header)) {
    if (token === "category") return CATEGORY_COLUMN;
    const key = lookup.get(token);
    if (key) return key;
  }
  return undefined;
}

const isBlankRow = (row: unknown[]) => row.every((cell) => isBlank(typeof cell === "string" ? cell.trim() : cell));

/**
 * The header is the row (among the first ten) that names the most known fields — so a title line
 * or a blank row above the table in a client's own export doesn't break mapping.
 */
export function detectHeaderRow(rows: unknown[][], fields: FieldDefinition[]): number {
  const { lookup } = headerLookup(fields);
  let best = { index: 0, score: 0 };
  rows.slice(0, 10).forEach((row, index) => {
    const score = row.filter((cell) => lookupHeader(lookup, cell) !== undefined).length;
    if (score > best.score) best = { index, score };
  });
  if (best.score === 0) return Math.max(0, rows.findIndex((row) => !isBlankRow(row)));
  return best.index;
}

/** Column → field key (or CATEGORY_COLUMN, or null to ignore). A field claimed twice keeps its first column. */
export type ColumnMapping = (string | null)[];

export function autoMapColumns(headers: unknown[], fields: FieldDefinition[]): ColumnMapping {
  const { lookup } = headerLookup(fields);
  const used = new Set<string>();
  return headers.map((header) => {
    const key = lookupHeader(lookup, header);
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
}

/* ---------------------------------------------------------------- planning */

export interface ImportContext {
  categories: CategoryDefinition[];
  fieldsFor: (categoryKey: string) => FieldDefinition[];
  optionsFor: (field: FieldDefinition, resolved: Record<string, FieldValue>, category: CategoryDefinition | undefined) => string[];
  existing: InventoryItem[];
  dateOrder: DateOrder;
}

export interface ImportOptions {
  /** "create": every row is a new item. "upsert": a row whose stock # exists updates that item. */
  mode: "create" | "upsert";
  /** Category for every row when the sheet has no category column. */
  categoryKey?: string;
  /** Per field: normalised raw value → the value to use instead (a "Rnd means Round" decision, applied to every row). */
  valueFixes?: Record<string, Record<string, string>>;
}

export interface RowIssue {
  fieldKey: string;
  message: string;
  suggestion?: string;
}

export interface PlannedRow {
  /** 1-based row number as the user sees it in the spreadsheet. */
  rowNumber: number;
  /** Set for workbooks — row numbers restart on every sheet. */
  sheetName?: string;
  action: "create" | "update" | "error";
  categoryKey?: string;
  code?: string;
  /** Stock # was blank in the sheet and assigned from the category's series. */
  autoNumbered?: boolean;
  existingId?: string;
  raw: RawValues;
  values: Record<string, FieldValue>;
  errors: RowIssue[];
  warnings: RowIssue[];
}

/** A value outside a list, counted across the whole file so it is fixed once, not per row. */
export interface UnknownValue {
  fieldKey: string;
  fieldLabel: string;
  categoryKey: string;
  value: string;
  rows: number[];
  suggestion?: string;
  options: string[];
  /** Set when the list is admin master data — the fix can be "add it to the list". */
  masterListKey?: string;
}

export interface ImportPlan {
  rows: PlannedRow[];
  unknownValues: UnknownValue[];
  /** Required fields no column maps to, per category — every new row of that category will fail. */
  missingRequired: { categoryKey: string; labels: string[] }[];
  summary: { create: number; update: number; error: number; blank: number; warnings: number };
}

function applyFix(fixes: ImportOptions["valueFixes"], fieldKey: string, value: unknown): unknown {
  const table = fixes?.[fieldKey];
  if (!table || isBlank(value)) return value;
  const token = normaliseToken(String(value));
  if (token in table) return table[token];
  // Multi-select cells hold several values; fix each part.
  if (typeof value === "string" && /[,;|]/.test(value)) {
    return value
      .split(/[,;|]/)
      .map((part) => table[normaliseToken(part.trim())] ?? part.trim())
      .join(", ");
  }
  return value;
}

/** Singular form for matching — sheets say "Watches" or "Diamonds" for the Watch and Diamond categories. */
const singular = (token: string) => token.replace(/(?:es|s)$/, "");

/** A category named by a cell or a sheet name — exact key/label first, then singular/plural ("Watches"). */
export function resolveCategory(cell: unknown, categories: CategoryDefinition[]): CategoryDefinition | undefined {
  const token = normaliseToken(String(cell ?? ""));
  const exact = categories.find((c) => normaliseToken(c.key) === token || normaliseToken(c.label) === token);
  if (exact) return exact;
  return categories.find((c) => singular(normaliseToken(c.key)) === singular(token) || singular(normaliseToken(c.label)) === singular(token));
}

/** One sheet (or CSV) to plan. `dataRows` excludes the header; `headerRowIndex` (0-based) keeps row numbers as Excel shows them. */
export interface SheetInput {
  sheetName?: string;
  dataRows: unknown[][];
  mapping: ColumnMapping;
  /** Category for every row when the sheet has no category column. */
  categoryKey?: string;
  headerRowIndex?: number;
}

/**
 * Plans every data row of a workbook. Sheets are planned together, not one by one, so automatic
 * stock numbers never repeat across sheets and a certificate on two sheets is caught as a duplicate.
 */
export function buildWorkbookPlan(sheets: SheetInput[], options: Omit<ImportOptions, "categoryKey">, context: ImportContext): ImportPlan {
  const existingByCode = new Map(context.existing.map((item) => [item.code.trim().toUpperCase(), item]));
  const takenCodes = new Set(context.existing.map((item) => item.code.trim().toUpperCase()));
  for (const sheet of sheets) {
    const codeColumn = sheet.mapping.indexOf("code");
    if (codeColumn < 0) continue;
    for (const row of sheet.dataRows) if (!isBlank(row[codeColumn])) takenCodes.add(String(row[codeColumn]).trim().toUpperCase());
  }
  /** fieldKey → normalised value → where it first appeared, for duplicates inside the file. */
  const seenInFile = new Map<string, Map<string, string>>();
  const unknown = new Map<string, UnknownValue>();
  const rows: PlannedRow[] = [];
  const missing = new Map<string, Set<string>>();
  let blank = 0;
  const multiSheet = sheets.length > 1;

  for (const sheet of sheets) {
    const { mapping } = sheet;
    const categoryColumn = mapping.indexOf(CATEGORY_COLUMN);
    const headerRowIndex = sheet.headerRowIndex ?? 0;
    const where = (rowNumber: number) => (multiSheet && sheet.sheetName ? `${sheet.sheetName} row ${rowNumber}` : `row ${rowNumber}`);

    sheet.dataRows.forEach((cells, index) => {
      const rowNumber = headerRowIndex + index + 2;
      if (isBlankRow(cells)) {
        blank++;
        return;
      }
      const planned: PlannedRow = { rowNumber, sheetName: sheet.sheetName, action: "error", raw: {}, values: {}, errors: [], warnings: [] };
      rows.push(planned);

      const category = categoryColumn >= 0 && !isBlank(cells[categoryColumn]) ? resolveCategory(cells[categoryColumn], context.categories) : context.categories.find((c) => c.key === sheet.categoryKey);
      if (!category) {
        const named = categoryColumn >= 0 ? String(cells[categoryColumn] ?? "").trim() : "";
        planned.errors.push({ fieldKey: CATEGORY_COLUMN, message: named ? `Unknown category "${named}"` : "No category — add a Category column or choose one for the sheet" });
        return;
      }
      planned.categoryKey = category.key;
      const fields = context.fieldsFor(category.key);
      const fieldKeys = new Set(fields.map((f) => f.key));

      const sheetRaw: RawValues = {};
      mapping.forEach((key, column) => {
        if (!key || key === CATEGORY_COLUMN || !fieldKeys.has(key)) return;
        const cell = typeof cells[column] === "string" ? (cells[column] as string).trim() : cells[column];
        if (!isBlank(cell)) sheetRaw[key] = applyFix(options.valueFixes, key, cell);
      });

      const code = isBlank(sheetRaw.code) ? "" : String(sheetRaw.code).trim().toUpperCase();
      const existing = code ? existingByCode.get(code) : undefined;
      let original: RawValues | undefined;

      if (existing && options.mode === "create") {
        planned.errors.push({ fieldKey: "code", message: `Stock number ${code} already exists — choose "Update existing" to change it` });
      }
      if (existing && options.mode === "upsert") {
        if (existing.category !== category.key) {
          planned.errors.push({ fieldKey: "code", message: `${code} is a ${existing.category} item, not ${category.label}` });
        }
        planned.existingId = existing.id;
        // Blank cells leave the item's value alone — an update sheet only needs the columns being changed.
        original = itemToValues(existing, fields);
        planned.raw = { ...original, ...sheetRaw };
      } else {
        planned.raw = { identityModel: category.defaultIdentityModel, ...sheetRaw };
        if (!code) {
          const assigned = nextStockNumber(category, [...takenCodes]);
          takenCodes.add(assigned);
          planned.raw.code = assigned;
          planned.autoNumbered = true;
        }
        const labels = missing.get(category.key) ?? new Set<string>();
        for (const f of fields) if (f.required && f.key !== "code" && f.key !== "identityModel" && isFieldVisible(f, planned.raw) && !mapping.includes(f.key)) labels.add(f.label);
        missing.set(category.key, labels);
      }
      planned.code = String(planned.raw.code ?? "");

      const validation = validateForm(fields, planned.raw, (f, resolved) => context.optionsFor(f, resolved, category), context.dateOrder, original);
      planned.values = validation.values;
      for (const [fieldKey, message] of Object.entries(validation.errors)) {
        planned.errors.push({ fieldKey, message, suggestion: validation.suggestions[fieldKey] });
        const bad = parseNotInList(message);
        const field = fields.find((f) => f.key === fieldKey);
        if (bad !== undefined && field) {
          const id = `${category.key}|${fieldKey}|${normaliseToken(bad)}`;
          const entry = unknown.get(id) ?? {
            fieldKey,
            fieldLabel: field.label,
            categoryKey: category.key,
            value: bad,
            rows: [],
            suggestion: validation.suggestions[fieldKey],
            options: context.optionsFor(field, validation.values, category),
            masterListKey: field.source?.kind === "masterList" ? field.source.key : undefined,
          };
          entry.rows.push(rowNumber);
          unknown.set(id, entry);
        }
      }
      for (const [fieldKey, message] of Object.entries(validation.warnings)) planned.warnings.push({ fieldKey, message });

      // Uniqueness: against stock already held, then against earlier rows of this file.
      const uniqueFields = fields.filter((f) => f.unique && isFieldVisible(f, planned.raw) && f.key !== "code");
      for (const conflict of findUniqueConflicts(uniqueFields, planned.values, context.existing, existing?.id)) {
        if (planned.errors.some((e) => e.fieldKey === conflict.fieldKey)) continue;
        // An update that leaves a clashing value as it was flags it; only a newly written duplicate blocks.
        if (original && sameRaw(original[conflict.fieldKey], planned.raw[conflict.fieldKey])) planned.warnings.push({ fieldKey: conflict.fieldKey, message: conflict.message });
        else planned.errors.push({ fieldKey: conflict.fieldKey, message: conflict.message });
      }
      for (const field of fields.filter((f) => f.unique)) {
        const value = planned.values[field.key];
        if (isBlank(value) || typeof value !== "string") continue;
        const token = normaliseToken(value);
        if (["none", "na", "nil"].includes(token)) continue;
        const seen = seenInFile.get(field.key) ?? new Map<string, string>();
        const first = seen.get(token);
        const unchanged = original && field.key !== "code" && sameRaw(original[field.key], planned.raw[field.key]);
        if (first !== undefined) (unchanged ? planned.warnings : planned.errors).push({ fieldKey: field.key, message: `${field.label} "${value}" is also on ${first}` });
        else seen.set(token, where(rowNumber));
        seenInFile.set(field.key, seen);
      }

      planned.action = planned.errors.length > 0 ? "error" : existing && options.mode === "upsert" ? "update" : "create";
    });
  }

  return {
    rows,
    unknownValues: [...unknown.values()].sort((a, b) => b.rows.length - a.rows.length),
    missingRequired: [...missing.entries()].filter(([, labels]) => labels.size > 0).map(([categoryKey, labels]) => ({ categoryKey, labels: [...labels] })),
    summary: {
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      error: rows.filter((r) => r.action === "error").length,
      blank,
      warnings: rows.filter((r) => r.warnings.length > 0).length,
    },
  };
}

/** Single-sheet convenience — a CSV, or one sheet with a category chosen for it. */
export function buildImportPlan(dataRows: unknown[][], mapping: ColumnMapping, options: ImportOptions, context: ImportContext, headerRowIndex = 0): ImportPlan {
  return buildWorkbookPlan([{ dataRows, mapping, categoryKey: options.categoryKey, headerRowIndex }], options, context);
}

/**
 * Which category a sheet holds, when neither a Category column nor its name says: the category whose
 * own (non-common) fields the headers name most. Ties and no-evidence return undefined — the user
 * picks rather than the importer guessing.
 */
export function guessCategory(headers: unknown[], categories: CategoryDefinition[], fieldsFor: (categoryKey: string) => FieldDefinition[]): string | undefined {
  const scores = categories.map((category) => {
    const own = fieldsFor(category.key).filter((f) => f.categories !== "All");
    const { lookup } = headerLookup(own);
    return { key: category.key, score: headers.filter((h) => lookupHeader(lookup, h) !== undefined).length };
  });
  const best = Math.max(0, ...scores.map((s) => s.score));
  const winners = scores.filter((s) => s.score === best);
  return best > 0 && winners.length === 1 ? winners[0].key : undefined;
}

/** "Field: message" for a row issue, without repeating the field name when the message already starts with it. */
export function describeIssue(label: string, message: string): string {
  return message.startsWith(label) ? message : `${label}: ${message}`;
}
