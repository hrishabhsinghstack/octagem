import { DocumentShell } from "@/components/documents/DocumentShell";
import { DocumentTextBlocks } from "@/components/documents/DocumentTextBlocks";
import { PrintLineTable } from "@/components/documents/PrintLineTable";
import { PrintTotals } from "@/components/documents/PrintTotals";
import { renderLegacyDocument } from "@/lib/document/legacyDocument";
import type { RenderedDocument } from "@/lib/document/renderDocument";
import { appFormatters } from "@/lib/document/formatters";

export interface PrintableLine {
  description: string;
  qty?: number;
  unitPrice?: number;
  total: number;
}

export interface PrintableField {
  label: string;
  value: string;
}

export interface PrintableDocumentProps {
  documentType: string;
  documentId: string;
  date: string;
  statusLabel?: string;
  counterpartyLabel: string;
  counterpartyName: string;
  counterpartyAddress?: string;
  fields?: PrintableField[];
  lines: PrintableLine[];
  currency: string;
  subtotal: number;
  taxLabel?: string;
  tax?: number;
  total: number;
  notes?: string;
  /**
   * When set, a template has already resolved the body and `lines`/`subtotal`/`tax`/`total` are ignored.
   * When absent, the legacy props are adapted onto the built-in Standard template — so there is exactly
   * one table renderer in the codebase, not two coexisting versions to keep in sync.
   */
  render?: RenderedDocument;
}

/**
 * Rendered by every document detail page but only made visible under `@media print` (see the
 * `hidden print:block` here against `print:hidden` on the screen UI) — this is what actually prints, and
 * what the browser's "Save as PDF" destination captures for Download.
 *
 * The prop surface is unchanged from before templates existed, so Memo and Purchase Order need no edits.
 * They come out better regardless: they pass no qty or unit price on some lines and used to print a wall
 * of empty cells, which Standard's hideWhenEmpty now collapses.
 */
export function PrintableDocument(props: PrintableDocumentProps) {
  const rendered =
    props.render ??
    renderLegacyDocument(
      {
        lines: props.lines,
        currency: props.currency,
        subtotal: props.subtotal,
        tax: props.tax,
        taxLabel: props.taxLabel,
        total: props.total,
        notes: props.notes,
      },
      appFormatters
    );

  return (
    <div className="hidden print:block">
      <DocumentShell
        documentType={props.documentType}
        documentId={props.documentId}
        date={props.date}
        statusLabel={props.statusLabel}
        counterpartyLabel={props.counterpartyLabel}
        counterpartyName={props.counterpartyName}
        counterpartyAddress={props.counterpartyAddress}
        fields={props.fields}
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
  );
}
