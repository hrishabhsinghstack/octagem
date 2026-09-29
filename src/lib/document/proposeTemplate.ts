import type { DocumentLineInput } from "@/lib/document/renderDocument";
import { getPath, isBlank } from "@/lib/inventory/fieldValues";
import type { FieldDefinition, FieldSection } from "@/types/catalog";
import type { DocumentTemplate, TemplateColumn } from "@/types/documentTemplate";

/**
 * "Save as template" from an invoice that already looks right: rather than making the tenant hunt through
 * a field picker, read the document and propose a column for every catalog field that actually carried a
 * value on these lines.
 *
 * Pure, so the proposal is testable without the dialog.
 */

/** The order proposed columns appear in — matches Settings → Inventory Catalog, so the list reads familiarly. */
const SECTION_ORDER: FieldSection[] = ["identity", "specification", "certificate", "components", "market", "custom", "pricing"];

/** Prices belong to the line, not the stock record — proposing `cost` would print what the business paid. */
const NEVER_PROPOSE = new Set(["cost", "askingPrice", "description", "title"]);

export interface ProposedColumn {
  column: TemplateColumn;
  /** Shown in the dialog so the user knows why it was suggested. */
  label: string;
  /** How many of the document's lines actually carry a value — "on 2 of 3 lines". */
  presentOn: number;
}

/** Catalog fields carrying a value on at least one line, in catalog order, excluding what's already shown. */
export function proposeColumns(args: { base: DocumentTemplate; lines: DocumentLineInput[]; fields: FieldDefinition[] }): ProposedColumn[] {
  const { base, lines, fields } = args;

  const alreadyShown = new Set(
    base.columns.filter((column) => column.source.kind === "catalogField").map((column) => (column.source as { fieldKey: string }).fieldKey)
  );

  const candidates = fields
    .filter((field) => !alreadyShown.has(field.key) && !NEVER_PROPOSE.has(field.key))
    .map((field) => ({
      field,
      presentOn: lines.filter((line) => line.item && !isBlank(getPath(line.item, field.path))).length,
    }))
    .filter(({ presentOn }) => presentOn > 0);

  candidates.sort((a, b) => {
    const section = SECTION_ORDER.indexOf(a.field.section) - SECTION_ORDER.indexOf(b.field.section);
    return section !== 0 ? section : a.field.sortOrder - b.field.sortOrder;
  });

  return candidates.map(({ field, presentOn }, index) => ({
    label: field.label,
    presentOn,
    column: {
      id: `c-proposed-${index + 1}-${field.key}`,
      source: { kind: "catalogField", fieldKey: field.key },
      format: "auto",
      // Narrow for a grade or a code, wider for free text.
      widthWeight: field.type === "text" && !field.source ? 3 : field.type === "select" ? 1.5 : 1,
      hideWhenEmpty: true,
      enabled: true,
    },
  }));
}

/**
 * Builds the template to save: the base's own columns, plus the accepted proposals inserted before the
 * money columns — amounts belong on the right, so appending would push Total away from the edge.
 */
export function buildProposedTemplate(args: { base: DocumentTemplate; accepted: TemplateColumn[]; name: string; id: string }): DocumentTemplate {
  const { base, accepted, name, id } = args;

  const isMoney = (column: TemplateColumn) =>
    column.source.kind === "line" && (column.source.field === "lineTotal" || column.source.field === "unitPrice" || column.source.field === "lineTax" || column.source.field === "lineDiscount");

  const firstMoney = base.columns.findIndex(isMoney);
  const insertAt = firstMoney === -1 ? base.columns.length : firstMoney;

  return {
    ...structuredClone(base),
    id,
    name: name.trim(),
    builtIn: false,
    columns: [...base.columns.slice(0, insertAt), ...accepted, ...base.columns.slice(insertAt)],
    updatedAt: new Date().toISOString(),
  };
}
