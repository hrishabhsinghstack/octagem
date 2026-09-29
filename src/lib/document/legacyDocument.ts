import { builtInTemplate } from "@/lib/document/builtInTemplates";
import { renderDocument, type DocumentFormatters, type DocumentLineInput, type RenderedDocument } from "@/lib/document/renderDocument";
import type { DocumentTemplate } from "@/types/documentTemplate";

/**
 * Adapts the fixed props the Memo and Purchase Order detail panels still pass into the one renderer, so
 * there is never a second table implementation to keep in sync with the first.
 *
 * Those callers were not migrated because they have no template picker yet — but they come out better
 * regardless: they pass no qty or unit price on some lines, and today print a wall of empty cells, which
 * Standard's hideWhenEmpty now collapses.
 */

export interface LegacyLine {
  description: string;
  qty?: number;
  unitPrice?: number;
  total: number;
}

export interface LegacyDocumentInput {
  lines: LegacyLine[];
  currency: string;
  subtotal: number;
  tax?: number;
  taxLabel?: string;
  total: number;
  notes?: string;
}

/** The columns a legacy caller can fill: it has no inventory items, so catalogField columns are inert. */
function legacyTemplate(taxLabel?: string): DocumentTemplate {
  const standard = builtInTemplate("invoice");
  return {
    ...standard,
    // Drop the Stock # column: a legacy caller folds the code into `description`, so it would never fill.
    columns: standard.columns.filter((column) => column.source.kind !== "catalogField"),
    totals: standard.totals.map((row) =>
      row.key === "tax" && taxLabel ? { ...row, label: taxLabel } : row.key === "paid" || row.key === "balance" ? { ...row, show: false } : row
    ),
    // Legacy callers pass a single `notes` string; keep the block that prints it and drop the rest.
    blocks: standard.blocks.filter((block) => block.source === "document"),
  };
}

export function renderLegacyDocument(input: LegacyDocumentInput, formatters: DocumentFormatters): RenderedDocument {
  const lines: DocumentLineInput[] = input.lines.map((line, index) => ({
    id: `legacy-${index}`,
    description: line.description,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: line.total,
  }));

  return renderDocument({
    template: legacyTemplate(input.taxLabel),
    lines,
    amounts: { subtotal: input.subtotal, tax: input.tax, total: input.total },
    currency: input.currency,
    // No items behind these lines, so no catalog fields can resolve — an empty registry is honest.
    fields: [],
    notes: input.notes,
    formatters,
  });
}
