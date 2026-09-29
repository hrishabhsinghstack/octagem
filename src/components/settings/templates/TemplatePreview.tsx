import { DocumentShell } from "@/components/documents/DocumentShell";
import { DocumentTextBlocks } from "@/components/documents/DocumentTextBlocks";
import { PrintLineTable } from "@/components/documents/PrintLineTable";
import { PrintTotals } from "@/components/documents/PrintTotals";
import { appFormatters } from "@/lib/document/formatters";
import { renderDocument, type DocumentLineInput } from "@/lib/document/renderDocument";
import { getAll as getInventory } from "@/lib/store/inventoryStore";
import type { FieldDefinition } from "@/types/catalog";
import type { DocumentTemplate } from "@/types/documentTemplate";
import { useMemo } from "react";

/** A4 at 96dpi. The preview is the real document scaled down, not a mock-up of it. */
const PAGE_WIDTH_PX = 794;
const PAGE_WIDTH_LANDSCAPE_PX = 1123;

interface TemplatePreviewProps {
  template: DocumentTemplate;
  fields: FieldDefinition[];
  /** Fraction of full size. 0.46 fits an A4 portrait page into a 26rem settings rail. */
  scale?: number;
}

/**
 * Renders the actual print components through the same renderDocument call the PDF uses, so the preview
 * cannot drift from what prints — which is the whole reason DocumentShell carries no `hidden print:block`.
 *
 * Sample lines come from real inventory, preferring items whose category the template's columns actually
 * reference, so a diamond template previews with carat and clarity filled in rather than a wall of
 * auto-hidden columns.
 */
export function TemplatePreview({ template, fields, scale = 0.46 }: TemplatePreviewProps) {
  const lines = useMemo(() => sampleLines(template, fields), [template, fields]);

  const rendered = useMemo(
    () =>
      renderDocument({
        template,
        lines,
        amounts: {
          subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
          discount: 250,
          tax: 0,
          shipping: 45,
          total: lines.reduce((sum, line) => sum + line.lineTotal, 0) - 250 + 45,
          paid: 1_000,
        },
        currency: "USD",
        fields,
        notes: "Sample note — this is what a per-invoice note looks like in this layout.",
        formatters: appFormatters,
      }),
    [template, lines, fields]
  );

  const pageWidth = template.options.landscape ? PAGE_WIDTH_LANDSCAPE_PX : PAGE_WIDTH_PX;

  return (
    <div className="rounded-lg border bg-muted/40 overflow-auto" style={{ height: `${Math.round(1123 * scale) + 24}px` }}>
      <div className="p-3">
        <div
          className="bg-white shadow-sm origin-top-left"
          style={{ width: `${pageWidth}px`, transform: `scale(${scale})`, marginBottom: `${-1123 * (1 - scale)}px` }}
        >
          <DocumentShell
            documentType="Invoice"
            documentId="INV-0000"
            date="29 Sept 2026"
            statusLabel="Open · Due 12 Oct 2026"
            counterpartyLabel="Bill to"
            counterpartyName="Sterling & Co."
            counterpartyAddress="22 W 48th St, New York, NY 10036"
            fields={[{ label: "Salesperson", value: "Devesh Rao" }]}
            options={rendered.options}
          >
            <DocumentTextBlocks blocks={rendered.blocks} slot="underHeader" />
            <DocumentTextBlocks blocks={rendered.blocks} slot="aboveLines" />
            <PrintLineTable columns={rendered.columns} rows={rendered.rows} />
            <PrintTotals rows={rendered.totals} />
            <DocumentTextBlocks blocks={rendered.blocks} slot="belowTotals" />
            <DocumentTextBlocks blocks={rendered.blocks} slot="footer" />
          </DocumentShell>
        </div>
      </div>
    </div>
  );
}

/**
 * Up to three real items, chosen so the template's own columns have something to show: the categories a
 * template references are inferred from its catalog fields' key prefixes, since a "diamond.*" column is
 * only meaningful on a Diamond.
 */
function sampleLines(template: DocumentTemplate, fields: FieldDefinition[]): DocumentLineInput[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const referenced = template.columns
    .filter((column) => column.enabled && column.source.kind === "catalogField")
    .map((column) => byKey.get((column.source as { fieldKey: string }).fieldKey))
    .filter((field): field is FieldDefinition => Boolean(field));

  const categories = new Set(referenced.flatMap((field) => (field.categories === "All" ? [] : field.categories)));

  const inventory = getInventory();
  const preferred = categories.size > 0 ? inventory.filter((item) => categories.has(item.category)) : [];
  const chosen = [...preferred, ...inventory].slice(0, 3);

  if (chosen.length === 0) {
    // A brand-new tenant with no stock still deserves a preview.
    return [{ id: "sample-1", description: "Sample item", quantity: 1, unitPrice: 1_000, lineTotal: 1_000 }];
  }

  return chosen.map((item, index) => ({
    id: `sample-${index + 1}`,
    description: `${item.code} · ${item.title}`,
    quantity: 1,
    unitPrice: item.askingPrice,
    lineTotal: item.askingPrice,
    item,
  }));
}
