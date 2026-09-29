import { getPath, isBlank } from "@/lib/inventory/fieldValues";
import type { FieldDefinition } from "@/types/catalog";
import type {
  ColumnAlign,
  ColumnFormat,
  DocumentTemplate,
  LineFieldKey,
  TemplateColumn,
  TemplateOptions,
  TextBlockKind,
  TextBlockSlot,
  TotalsRowKey,
} from "@/types/documentTemplate";
import { LINE_FIELD_LABELS } from "@/types/documentTemplate";
import type { InventoryItem } from "@/types/inventory";

/**
 * Turns a template + a document into a concrete column set and rows. Pure and React-free so the printed
 * page, the on-screen table and the Settings preview all consume one result and cannot drift apart.
 *
 * Formatters are injected rather than imported: formatCurrency reads the tenant's number locale from
 * localStorage (lib/utils.ts → getNumberLocale), which a node test has no business needing, and injecting
 * keeps assertions stable across locales.
 */

/* ------------------------------------------------------------------ input */

/** What the engine needs about one line, whatever document produced it. */
export interface DocumentLineInput {
  id: string;
  description: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal: number;
  lineDiscount?: number;
  lineTax?: number;
  /** The stock record behind the line; undefined for a free-text charge, or an item since deleted. */
  item?: InventoryItem;
}

export interface DocumentAmounts {
  subtotal: number;
  discount?: number;
  tax?: number;
  shipping?: number;
  total: number;
  paid?: number;
}

export interface DocumentFormatters {
  currency: (value: number, currency: string) => string;
  /** `decimals` is a maximum, not a fixed count — a 1.5 ct stone prints "1.5", not "1.500". */
  number: (value: number, decimals?: number) => string;
  date: (iso: string) => string;
}

export interface RenderInput {
  template: DocumentTemplate;
  lines: DocumentLineInput[];
  amounts: DocumentAmounts;
  currency: string;
  /**
   * Every catalog field the tenant has, active or not — from registry.allFields(), not
   * fieldsForCategory(). A field switched off in the catalog still has values sitting on items, and a
   * template printing them must keep working; it is flagged, not dropped.
   */
  fields: FieldDefinition[];
  /** This document's own free text, for a TextBlock with source "document". */
  notes?: string;
  formatters: DocumentFormatters;
}

/* ------------------------------------------------------------------ output */

export interface RenderedColumn {
  /** The TemplateColumn id — a stable React key and what the editor highlights. */
  id: string;
  header: string;
  align: ColumnAlign;
  /** Percent of table width, already normalised across the surviving columns to sum to 100. */
  widthPct: number;
}

/** `cells` is positionally parallel to `columns` — both renderers just zip them. */
export interface RenderedRow {
  key: string;
  cells: string[];
}

export interface RenderedTotalsRow {
  key: TotalsRowKey;
  label: string;
  text: string;
  emphasis: boolean;
}

export interface RenderedBlock {
  id: string;
  kind: TextBlockKind;
  slot: TextBlockSlot;
  heading: string;
  body: string;
}

/**
 * Something the layout did that the person configuring it should know about. Surfaced in the template
 * editor and on the invoice; never printed on the document itself.
 *
 * `unidentifiedLine` is not about a column at all — it flags a row that would print as a bare amount
 * with nothing naming it, which happens when a template carries no description column and the document
 * has a free-text line. Its `columnId` is the line id instead.
 */
export interface RenderDiagnostic {
  columnId: string;
  reason: "disabled" | "emptyOnEveryLine" | "unknownField" | "inactiveField" | "clampedWidth" | "unidentifiedLine";
  detail?: string;
}

export interface RenderedDocument {
  columns: RenderedColumn[];
  rows: RenderedRow[];
  totals: RenderedTotalsRow[];
  blocks: RenderedBlock[];
  options: TemplateOptions;
  diagnostics: RenderDiagnostic[];
}

/* ------------------------------------------------------------------ column resolution */

/** A column that survived resolution, with everything needed to produce its cells. */
interface ColumnSpec {
  column: TemplateColumn;
  header: string;
  align: ColumnAlign;
  /** The raw, unformatted value — emptiness is judged on this, never on the formatted string. */
  raw: (line: DocumentLineInput, index: number) => unknown;
  format: (raw: unknown, currency: string, formatters: DocumentFormatters) => string;
}

const LINE_VALUE: Record<LineFieldKey, (line: DocumentLineInput) => unknown> = {
  description: (line) => line.description,
  quantity: (line) => line.quantity,
  unitPrice: (line) => line.unitPrice,
  lineTotal: (line) => line.lineTotal,
  lineDiscount: (line) => line.lineDiscount,
  lineTax: (line) => line.lineTax,
};

/** Money line fields print as currency unless told otherwise; everything else follows its own type. */
const MONEY_LINE_FIELDS = new Set<LineFieldKey>(["unitPrice", "lineTotal", "lineDiscount", "lineTax"]);

function defaultAlign(format: ColumnFormat): ColumnAlign {
  return format === "number" || format === "currency" || format === "date" ? "right" : "left";
}

/** The format a column actually prints in, once "auto" has been resolved against its source. */
function effectiveFormat(column: TemplateColumn, field?: FieldDefinition): ColumnFormat {
  if (column.format !== "auto") return column.format;
  if (column.source.kind === "index") return "text";
  if (column.source.kind === "line") return MONEY_LINE_FIELDS.has(column.source.field) ? "currency" : column.source.field === "quantity" ? "number" : "text";
  switch (field?.type) {
    case "number":
    case "integer":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "yesNo";
    default:
      return "text";
  }
}

function formatValue(raw: unknown, format: ColumnFormat, currency: string, formatters: DocumentFormatters, decimals?: number): string {
  if (isBlank(raw)) return "";
  switch (format) {
    case "currency":
      return typeof raw === "number" ? formatters.currency(raw, currency) : String(raw);
    case "number":
      return typeof raw === "number" ? formatters.number(raw, decimals) : String(raw);
    case "date":
      return typeof raw === "string" ? formatters.date(raw) : String(raw);
    case "yesNo":
      return raw === true ? "Yes" : raw === false ? "No" : String(raw);
    default:
      // A multiselect arrives as string[] — comma-joined so a features column reads as one cell.
      return Array.isArray(raw) ? raw.join(", ") : String(raw);
  }
}

/**
 * Resolves each enabled column against the catalog. A column whose field no longer exists is dropped
 * with a diagnostic rather than rendered as blanks; a column whose field is merely deactivated is kept,
 * because items still hold values for it and a template printing them must keep working.
 */
export function resolveColumns(template: DocumentTemplate, fields: FieldDefinition[]): { specs: ColumnSpec[]; diagnostics: RenderDiagnostic[] } {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const specs: ColumnSpec[] = [];
  const diagnostics: RenderDiagnostic[] = [];

  for (const column of template.columns) {
    if (!column.enabled) {
      diagnostics.push({ columnId: column.id, reason: "disabled" });
      continue;
    }

    let field: FieldDefinition | undefined;
    if (column.source.kind === "catalogField") {
      field = byKey.get(column.source.fieldKey);
      if (!field) {
        diagnostics.push({ columnId: column.id, reason: "unknownField", detail: column.source.fieldKey });
        continue;
      }
      if (!field.active) diagnostics.push({ columnId: column.id, reason: "inactiveField", detail: field.label });
    }

    const format = effectiveFormat(column, field);
    const fallbackHeader =
      column.source.kind === "index"
        ? "#"
        : column.source.kind === "line"
          ? LINE_FIELD_LABELS[column.source.field]
          : `${field!.label}${field!.unit ? ` (${field!.unit})` : ""}`;

    const raw: ColumnSpec["raw"] =
      column.source.kind === "index"
        ? (_line, index) => index + 1
        : column.source.kind === "line"
          ? (line) => LINE_VALUE[(column.source as { kind: "line"; field: LineFieldKey }).field](line)
          : (line) => (line.item ? getPath(line.item, field!.path) : undefined);

    specs.push({
      column,
      // "" is meaningful (print no header), so this must be ?? and not ||.
      header: column.header ?? fallbackHeader,
      align: column.align ?? defaultAlign(format),
      raw,
      format: (value, currency, formatters) => formatValue(value, format, currency, formatters, field?.decimals),
    });
  }

  return { specs, diagnostics };
}

/* ------------------------------------------------------------------ widths */

/**
 * Minimum share of the table any surviving column gets. Without it a 12-column template squeezes
 * Description to 4% and the printed table becomes unreadable — and because the user can override
 * orientation in the browser's own print dialog, the layout has to survive portrait regardless of the
 * template's `landscape` flag.
 */
const MIN_WIDTH_PCT = 6;

/** Normalises weights to percentages summing to 100, clamping each to a readable floor. */
export function normaliseWidths(weights: number[]): { widths: number[]; clamped: boolean[] } {
  if (weights.length === 0) return { widths: [], clamped: [] };

  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 1));
  const total = safe.reduce((sum, weight) => sum + weight, 0);
  const rawPct = safe.map((weight) => (weight / total) * 100);

  // So many columns that even the floor cannot be honoured — share the table equally and report every
  // column as clamped. The template validator caps column count, so this is the belt to that braces.
  if (safe.length * MIN_WIDTH_PCT >= 100) {
    return { widths: safe.map(() => 100 / safe.length), clamped: safe.map(() => true) };
  }

  const clamped = rawPct.map((pct) => pct < MIN_WIDTH_PCT);
  if (!clamped.some(Boolean)) return { widths: rawPct, clamped };

  // Give every clamped column its floor, then share what is left among the rest by their own weights.
  const remaining = 100 - clamped.filter(Boolean).length * MIN_WIDTH_PCT;
  const flexibleWeight = safe.reduce((sum, weight, index) => (clamped[index] ? sum : sum + weight), 0);
  const flexibleCount = clamped.filter((isClamped) => !isClamped).length;

  const widths = safe.map((weight, index) => {
    if (clamped[index]) return MIN_WIDTH_PCT;
    return flexibleWeight > 0 ? (weight / flexibleWeight) * remaining : remaining / flexibleCount;
  });
  return { widths, clamped };
}

/* ------------------------------------------------------------------ line table */

export function renderLineTable(input: RenderInput): { columns: RenderedColumn[]; rows: RenderedRow[]; diagnostics: RenderDiagnostic[] } {
  const { specs, diagnostics } = resolveColumns(input.template, input.fields);

  // The raw value matrix, built once. Emptiness is decided here, on raw values, before any formatting:
  // 0 formats to "0" and undefined to "", so judging on text would coincidentally work for currency and
  // silently break a "Lab grown: No" column or a "Qty: 0" line.
  const matrix = input.lines.map((line, index) => specs.map((spec) => spec.raw(line, index)));

  // Keep each column's original index so cells can be read straight out of the matrix after filtering.
  const kept = specs
    .map((spec, index) => ({ spec, index }))
    .filter(({ spec, index }) => {
      if (!spec.column.hideWhenEmpty) return true;
      // Only when EVERY line is blank — a mixed diamond + watch invoice must keep the carat column, with
      // a blank on the watch row. That asymmetry is what lets one template serve mixed categories.
      const emptyEverywhere = matrix.length > 0 && matrix.every((row) => isBlank(row[index]));
      if (emptyEverywhere) diagnostics.push({ columnId: spec.column.id, reason: "emptyOnEveryLine" });
      return !emptyEverywhere;
    });

  // Widths are normalised after auto-hide, so collapsing a column widens the survivors rather than
  // leaving a gap.
  const { widths, clamped } = normaliseWidths(kept.map(({ spec }) => spec.column.widthWeight));
  kept.forEach(({ spec }, position) => {
    if (clamped[position]) diagnostics.push({ columnId: spec.column.id, reason: "clampedWidth" });
  });

  const columns: RenderedColumn[] = kept.map(({ spec }, position) => ({
    id: spec.column.id,
    header: spec.header,
    align: spec.align,
    widthPct: Math.round(widths[position] * 100) / 100,
  }));

  // A column whose value tells a reader *what* the line is, as opposed to what it costs or where it sits.
  const identifies = kept.map(
    ({ spec }) =>
      spec.column.source.kind === "catalogField" ||
      (spec.column.source.kind === "line" && spec.column.source.field === "description")
  );

  const rows: RenderedRow[] = input.lines.map((line, lineIndex) => {
    const cells = kept.map(({ spec, index }) => spec.format(matrix[lineIndex][index], input.currency, input.formatters));
    // A row that prints only an amount is unreadable on a document a customer has to check. This happens
    // when a template carries no description column and the line has no stock record behind it.
    if (cells.every((cell, position) => !identifies[position] || cell === "")) {
      diagnostics.push({ columnId: line.id, reason: "unidentifiedLine", detail: line.description });
    }
    return { key: line.id, cells };
  });

  return { columns, rows, diagnostics };
}

/* ------------------------------------------------------------------ totals */

const TOTALS_VALUE: Record<TotalsRowKey, (amounts: DocumentAmounts) => number> = {
  subtotal: (a) => a.subtotal,
  discount: (a) => a.discount ?? 0,
  tax: (a) => a.tax ?? 0,
  shipping: (a) => a.shipping ?? 0,
  total: (a) => a.total,
  paid: (a) => a.paid ?? 0,
  balance: (a) => a.total - (a.paid ?? 0),
};

export function renderTotals(template: DocumentTemplate, amounts: DocumentAmounts, currency: string, formatters: DocumentFormatters): RenderedTotalsRow[] {
  const rows: RenderedTotalsRow[] = [];
  for (const row of template.totals) {
    const value = TOTALS_VALUE[row.key](amounts);
    // Total renders even when switched off — a document with no total is not a document. Mirrors the way
    // applyOverride forces `system` catalog fields active.
    const forced = row.key === "total";
    if (!row.show && !forced) continue;
    if (row.hideWhenZero && value === 0 && !forced) continue;
    // A discount is a reduction; printing it unsigned reads as an extra charge.
    const text = row.key === "discount" && value > 0 ? `−${formatters.currency(value, currency)}` : formatters.currency(value, currency);
    rows.push({ key: row.key, label: row.label, text, emphasis: row.emphasis });
  }
  return rows;
}

/* ------------------------------------------------------------------ text blocks */

const SLOT_ORDER: TextBlockSlot[] = ["underHeader", "aboveLines", "belowTotals", "footer"];

export function renderBlocks(template: DocumentTemplate, notes?: string): RenderedBlock[] {
  return template.blocks
    .filter((block) => block.show)
    .map((block) => ({ block, body: block.source === "document" ? (notes ?? "") : block.body }))
    // A "document" block with nothing to say is dropped rather than printing an empty heading. A
    // signature block is the exception: its whole point is the ruled line, so it survives an empty body.
    .filter(({ block, body }) => body.trim() !== "" || block.kind === "signature")
    .sort((a, b) => SLOT_ORDER.indexOf(a.block.slot) - SLOT_ORDER.indexOf(b.block.slot) || a.block.sortOrder - b.block.sortOrder)
    .map(({ block, body }) => ({ id: block.id, kind: block.kind, slot: block.slot, heading: block.heading, body }));
}

/* ------------------------------------------------------------------ compose */

export function renderDocument(input: RenderInput): RenderedDocument {
  const { columns, rows, diagnostics } = renderLineTable(input);
  return {
    columns,
    rows,
    totals: renderTotals(input.template, input.amounts, input.currency, input.formatters),
    blocks: renderBlocks(input.template, input.notes),
    options: input.template.options,
    diagnostics,
  };
}

/** Blocks for one slot, in order — how the print components pick what belongs where. */
export function blocksInSlot(blocks: RenderedBlock[], slot: TextBlockSlot): RenderedBlock[] {
  return blocks.filter((block) => block.slot === slot);
}
