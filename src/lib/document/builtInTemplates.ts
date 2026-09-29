import type { ColumnAlign, ColumnSource, DocumentKind, DocumentTemplate, LineFieldKey, TemplateColumn, TemplateOptions, TotalsRow, TotalsRowKey } from "@/types/documentTemplate";
import { TOTALS_ROW_KEYS } from "@/types/documentTemplate";

/**
 * Templates that ship with the product. They live in code, never in storage: a tenant duplicates one to
 * get something editable, so a release can improve the starters without rewriting anyone's saved work.
 *
 * Every `catalogField` key here is asserted against BUILT_IN_FIELDS by renderDocument.test.ts — a typo
 * in this file would otherwise only surface on a customer's invoice.
 */

let seq = 0;
/** Deterministic, readable ids — "c3-diamond.color" survives a reorder and reads well in a diagnostic. */
const columnId = (source: ColumnSource) =>
  `c${++seq}-${source.kind === "catalogField" ? source.fieldKey : source.kind === "line" ? source.field : "index"}`;

function column(source: ColumnSource, widthWeight: number, over: Partial<TemplateColumn> = {}): TemplateColumn {
  return {
    id: columnId(source),
    source,
    format: "auto",
    widthWeight,
    // Default on: a column with nothing in it anywhere is noise, and this is what lets one template
    // serve diamonds, jewelry and watches at once.
    hideWhenEmpty: true,
    enabled: true,
    ...over,
  };
}

const catalog = (fieldKey: string, widthWeight: number, over: Partial<TemplateColumn> = {}) => column({ kind: "catalogField", fieldKey }, widthWeight, over);
const lineField = (field: LineFieldKey, widthWeight: number, over: Partial<TemplateColumn> = {}) => column({ kind: "line", field }, widthWeight, over);

const indexColumn = (over: Partial<TemplateColumn> = {}) =>
  // An index column names itself by position, so it prints no header and never collapses.
  column({ kind: "index" }, 1, { header: "", align: "left" as ColumnAlign, hideWhenEmpty: false, ...over });

/** Every key present, so the editor can list them all and the resolver never invents one. */
function totals(over: Partial<Record<TotalsRowKey, Partial<TotalsRow>>> = {}): TotalsRow[] {
  const defaults: Record<TotalsRowKey, TotalsRow> = {
    subtotal: { key: "subtotal", label: "Subtotal", show: true, hideWhenZero: false, emphasis: false },
    discount: { key: "discount", label: "Discount", show: true, hideWhenZero: true, emphasis: false },
    tax: { key: "tax", label: "Tax", show: true, hideWhenZero: true, emphasis: false },
    shipping: { key: "shipping", label: "Shipping", show: true, hideWhenZero: true, emphasis: false },
    total: { key: "total", label: "Total", show: true, hideWhenZero: false, emphasis: true },
    paid: { key: "paid", label: "Paid", show: true, hideWhenZero: true, emphasis: false },
    balance: { key: "balance", label: "Balance due", show: true, hideWhenZero: false, emphasis: true },
  };
  return TOTALS_ROW_KEYS.map((key) => ({ ...defaults[key], ...over[key] }));
}

const OPTIONS: TemplateOptions = { showLogo: true, showBusinessAddress: true, paper: "A4", landscape: false, showPoweredBy: true };

/** The tenant's own per-document note, positioned by the template rather than hardcoded under the totals. */
const documentNotesBlock = { id: "b1-notes", kind: "notes" as const, slot: "belowTotals" as const, heading: "Notes", source: "document" as const, body: "", show: true, sortOrder: 1 };

const BUILT_AT = "2026-01-01T00:00:00.000Z";

function template(id: string, name: string, kind: DocumentKind, columns: TemplateColumn[], over: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return { id, name, kind, builtIn: true, columns, totals: totals(), blocks: [documentNotesBlock], options: OPTIONS, updatedAt: BUILT_AT, ...over };
}

export const BUILT_IN_TEMPLATES: DocumentTemplate[] = [
  /**
   * Matches what the invoice printed before templates existed — Description / Qty / Unit price / Total —
   * so an existing tenant sees no change on first load, except that empty Qty and Unit price columns now
   * collapse instead of printing a wall of blanks. Also the fallback whenever no default is set.
   */
  template("builtin.invoice.standard", "Standard", "invoice", [
    catalog("code", 2, { header: "Stock #" }),
    lineField("description", 6, { hideWhenEmpty: false }),
    lineField("quantity", 1),
    lineField("unitPrice", 2),
    lineField("lineTotal", 2, { hideWhenEmpty: false }),
  ]),

  /**
   * The disclosure-heavy layout a diamond buyer expects: the 4 Cs plus lab and certificate number on the
   * face of the invoice. Ten columns, so it ships landscape.
   */
  template(
    "builtin.invoice.diamondDetail",
    "Diamond detail",
    "invoice",
    [
      indexColumn(),
      catalog("code", 2, { header: "Stock #" }),
      // Never auto-hides: a free-text line (labour, freight, a repair) has no stock behind it, so the
      // description is the only thing identifying it. Without this the row prints as a bare amount.
      lineField("description", 3, { hideWhenEmpty: false }),
      catalog("diamond.shape", 2),
      catalog("diamond.caratWeight", 1.5),
      catalog("diamond.color", 1),
      catalog("diamond.clarity", 1),
      catalog("diamond.cut", 1.5),
      catalog("diamond.lab", 1),
      catalog("diamond.certificateNumber", 2.5),
      lineField("lineTotal", 2, { hideWhenEmpty: false }),
    ],
    { options: { ...OPTIONS, landscape: true } }
  ),

  /**
   * Retail jewelry: what the piece is made of and what it weighs, which is what a customer queries on a
   * hallmarked item. Ten columns, so landscape — on A4 portrait each would get ~18mm, too tight for a
   * money column, and the printed table would be unreadable rather than merely cramped.
   */
  template(
    "builtin.invoice.jewelryRetail",
    "Jewelry retail",
    "invoice",
    [
      indexColumn(),
      catalog("code", 2, { header: "Style #" }),
      lineField("description", 4, { hideWhenEmpty: false }),
      catalog("jewelry.metalType", 1.5),
      catalog("jewelry.metalKarat", 1),
      catalog("jewelry.grossWeightGrams", 1.5),
      catalog("jewelry.totalDiamondCarats", 1.5),
      lineField("quantity", 1),
      lineField("unitPrice", 2),
      lineField("lineTotal", 2, { hideWhenEmpty: false }),
    ],
    { options: { ...OPTIONS, landscape: true } }
  ),
];

/** The starter for a kind — the last link in resolveTemplateFor's fallback chain, so it must always exist. */
export function builtInTemplate(kind: DocumentKind): DocumentTemplate {
  const found = BUILT_IN_TEMPLATES.find((candidate) => candidate.kind === kind);
  // Invoice's Standard is the universal fallback: better a plain correct document than none.
  return found ?? BUILT_IN_TEMPLATES[0];
}

export function builtInTemplatesFor(kind: DocumentKind): DocumentTemplate[] {
  return BUILT_IN_TEMPLATES.filter((candidate) => candidate.kind === kind);
}
