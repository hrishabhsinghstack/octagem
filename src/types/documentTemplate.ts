/**
 * Configurable layout for a business document. One template is the single source of truth for the line
 * table on BOTH the printed PDF and the on-screen detail panel, so the two can never disagree about
 * which columns exist or what they are called — before this, the invoice printed four fixed columns and
 * displayed two different ones.
 *
 * Built-in templates live in code (lib/document/builtInTemplates.ts) and are never stored; tenants
 * duplicate them. Unlike catalog field overrides, a template edit is NOT stored as a diff — `columns` is
 * an ordered array, and arrays do not merge sanely, so a tenant edit owns a whole copy.
 */

/** Documents the engine serves. Only "invoice" is wired now; the rest exist so nothing is re-keyed later. */
export type DocumentKind = "invoice" | "memo" | "purchaseOrder";

export const DOCUMENT_KINDS: { key: DocumentKind; label: string; enabled: boolean }[] = [
  { key: "invoice", label: "Invoice", enabled: true },
  { key: "memo", label: "Memo", enabled: false },
  { key: "purchaseOrder", label: "Purchase Order", enabled: false },
];

/**
 * Values belonging to the document line itself rather than the stock record behind it.
 * "lineDiscount" and "lineTax" have no home on InvoiceLine yet — declared now so a template built today
 * keeps working when they land, and until then they resolve blank (and so auto-hide themselves).
 */
export type LineFieldKey = "description" | "quantity" | "unitPrice" | "lineTotal" | "lineDiscount" | "lineTax";

export const LINE_FIELD_LABELS: Record<LineFieldKey, string> = {
  description: "Description",
  quantity: "Qty",
  unitPrice: "Unit price",
  lineTotal: "Total",
  lineDiscount: "Line discount",
  lineTax: "Line tax",
};

/** Where a column gets its value. */
export type ColumnSource =
  /** A field on the document line itself. */
  | { kind: "line"; field: LineFieldKey }
  /**
   * Any inventory catalog field, by FieldDefinition.key — resolved off the line's linked item through
   * that definition's dot `path`. The key is stored, never the path, so a field whose storage location
   * moves keeps working and a renamed label propagates. A key that no longer exists is reported as a
   * diagnostic, never silently printed as a column of blanks.
   */
  | { kind: "catalogField"; fieldKey: string }
  /** 1, 2, 3 … the row's position in the printed table. */
  | { kind: "index" };

export type ColumnAlign = "left" | "center" | "right";

/**
 * "auto" derives from the source: currency for money line fields, and the catalog field's own type and
 * `decimals` otherwise. Set explicitly only to override — printing a per-carat rate as plain number, or
 * a certificate number that happens to be all digits as text so it keeps its leading zeros.
 */
export type ColumnFormat = "auto" | "text" | "number" | "currency" | "date" | "yesNo";

export interface TemplateColumn {
  /** Stable id within the template. Reordering and relabelling never change it. */
  id: string;
  source: ColumnSource;
  /**
   * Printed header. Undefined falls back to the live source label with the catalog field's unit
   * appended — "Carat (ct)" — so values print bare and a catalog rename shows through. A tenant wanting
   * "Stock #" instead of "SKU" types it here. An empty string prints no header, which is what an index
   * column wants. Note this needs `??` not `||`: "" is a meaningful value.
   */
  header?: string;
  /** Undefined aligns by format: number, currency and date right, everything else left. */
  align?: ColumnAlign;
  format: ColumnFormat;
  /**
   * Relative width, not px or percent — the renderer normalises the weights of the columns that actually
   * survived into percentages, so the layout stays sane when a column auto-hides or the paper changes.
   * A description is typically 5, a clarity grade 1.
   */
  widthWeight: number;
  /**
   * The reason one template serves mixed categories: a column with no value on ANY line of this document
   * collapses instead of printing a column of dashes. Off for columns that must appear even when blank —
   * a Qty column staff sign against, a required disclosure.
   */
  hideWhenEmpty: boolean;
  /** Configured but switched off. Kept rather than deleted so the admin can put it back (mirrors FieldDefinition.active). */
  enabled: boolean;
}

/** The money rows under the line table. */
export type TotalsRowKey = "subtotal" | "discount" | "tax" | "shipping" | "total" | "paid" | "balance";

export const TOTALS_ROW_KEYS: TotalsRowKey[] = ["subtotal", "discount", "tax", "shipping", "total", "paid", "balance"];

export interface TotalsRow {
  key: TotalsRowKey;
  /** Renameable — "GST", "VAT", "Freight", "Amount due". */
  label: string;
  show: boolean;
  /** Suppresses the row when the amount is 0, so a counter sale with no shipping prints no Shipping line. */
  hideWhenZero: boolean;
  /** Bold, above a rule. Total always is; Balance usually is. */
  emphasis: boolean;
}

/** Where a text block prints, relative to the fixed parts of the page. */
export type TextBlockSlot = "underHeader" | "aboveLines" | "belowTotals" | "footer";

export const TEXT_BLOCK_SLOTS: { key: TextBlockSlot; label: string }[] = [
  { key: "underHeader", label: "Under the header" },
  { key: "aboveLines", label: "Above the lines" },
  { key: "belowTotals", label: "Below the totals" },
  { key: "footer", label: "Page footer" },
];

/**
 * What the block is for. Only "signature" renders differently (a ruled line and a caption instead of a
 * paragraph); the rest are the same paragraph with a different default heading. They exist as a type so
 * the editor can offer ready-made blocks, and so a future audit can find, say, the warranty text.
 */
export type TextBlockKind = "terms" | "notes" | "paymentInstructions" | "warranty" | "signature" | "custom";

export const TEXT_BLOCK_KINDS: { key: TextBlockKind; label: string; defaultHeading: string }[] = [
  { key: "terms", label: "Terms & conditions", defaultHeading: "Terms & conditions" },
  { key: "notes", label: "Notes", defaultHeading: "Notes" },
  { key: "paymentInstructions", label: "Payment instructions", defaultHeading: "Payment instructions" },
  { key: "warranty", label: "Warranty / disclosure", defaultHeading: "Warranty & disclosure" },
  { key: "signature", label: "Signature line", defaultHeading: "Received by" },
  { key: "custom", label: "Custom text", defaultHeading: "" },
];

export interface TextBlock {
  /** Stable id within the template — reordering must not renumber the others. */
  id: string;
  kind: TextBlockKind;
  slot: TextBlockSlot;
  /** Printed above the body in small caps. Empty prints the body with no heading. */
  heading: string;
  /**
   * "template": `body` is boilerplate stored on the template (T&Cs, warranty, bank details).
   * "document": the text comes from this document's own notes field and `body` is ignored — so a
   * per-invoice note still prints, positioned and titled by the template. A "document" block with
   * nothing to say is dropped, not printed as an empty heading.
   */
  source: "template" | "document";
  body: string;
  show: boolean;
  sortOrder: number;
}

/** Whole-document switches that are not columns, totals or text. */
export interface TemplateOptions {
  /** Off for pre-printed letterhead stock, where the logo would otherwise print twice. */
  showLogo: boolean;
  showBusinessAddress: boolean;
  /** Overrides the accent used for rules and the document title; undefined follows Branding settings. */
  accentColor?: string;
  /** The paper the column widths are measured against, and what the overflow warning in Settings checks. */
  paper: "A4" | "Letter";
  /** Wide templates (8+ columns) need this; emitted as an @page rule — see usePrintPageStyle. */
  landscape: boolean;
  /** The "Powered by OctaGem" credit. */
  showPoweredBy: boolean;
}

export interface DocumentTemplate {
  /** Stable id. Built-ins use a readable literal ("builtin.invoice.diamondDetail") so a stored default survives a release. */
  id: string;
  name: string;
  kind: DocumentKind;
  /** Ships in code. Can be hidden from the picker and duplicated — never edited in place, never deleted. */
  builtIn: boolean;
  /** Ordered left to right as printed. */
  columns: TemplateColumn[];
  /** One entry per TotalsRowKey, so the editor lists them all and the resolver never has to invent one. */
  totals: TotalsRow[];
  blocks: TextBlock[];
  options: TemplateOptions;
  updatedAt: string;
}

/**
 * Deliberately not on DocumentTemplate: `isDefault`. Two templates flagged default is a bug the type
 * should not permit, so the default lives in the store as one id per kind — see documentTemplateStore.
 */
export interface StoredTemplates {
  templates: DocumentTemplate[];
  defaults: Partial<Record<DocumentKind, string>>;
  /** Built-in ids hidden from the picker — deactivated, never deleted (mirrors built-in categories). */
  hiddenBuiltIns: string[];
}
