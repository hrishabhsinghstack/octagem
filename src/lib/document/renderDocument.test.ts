import { mockInventory } from "@/data/mockInventory";
import { BUILT_IN_TEMPLATES, builtInTemplate } from "@/lib/document/builtInTemplates";
import {
  normaliseWidths,
  renderBlocks,
  renderDocument,
  renderLineTable,
  renderTotals,
  type DocumentFormatters,
  type DocumentLineInput,
  type RenderInput,
} from "@/lib/document/renderDocument";
import { BUILT_IN_FIELDS } from "@/lib/inventory/builtInFields";
import type { FieldDefinition } from "@/types/catalog";
import type { ColumnSource, DocumentTemplate, TemplateColumn, TemplateOptions, TextBlock, TotalsRow } from "@/types/documentTemplate";
import { TOTALS_ROW_KEYS } from "@/types/documentTemplate";
import type { InventoryItem } from "@/types/inventory";
import { describe, expect, it } from "vitest";

/* ------------------------------------------------------------------ fixtures */

/** Stubbed so assertions never depend on Intl or the tenant's stored number locale. */
const formatters: DocumentFormatters = {
  currency: (value, currency) => `${currency} ${value.toFixed(2)}`,
  number: (value, decimals) => (decimals === undefined ? String(value) : String(Number(value.toFixed(decimals)))),
  date: (iso) => `D(${iso})`,
};

const OPTIONS: TemplateOptions = { showLogo: true, showBusinessAddress: true, paper: "A4", landscape: false, showPoweredBy: true };

const allTotals = (over: Partial<TotalsRow> = {}): TotalsRow[] =>
  TOTALS_ROW_KEYS.map((key) => ({ key, label: key, show: true, hideWhenZero: false, emphasis: false, ...over }));

let n = 0;
const col = (source: ColumnSource, over: Partial<TemplateColumn> = {}): TemplateColumn => ({
  id: `col${++n}`,
  source,
  format: "auto",
  widthWeight: 1,
  hideWhenEmpty: true,
  enabled: true,
  ...over,
});

const template = (columns: TemplateColumn[], over: Partial<DocumentTemplate> = {}): DocumentTemplate => ({
  id: "t1",
  name: "Test",
  kind: "invoice",
  builtIn: false,
  columns,
  totals: allTotals(),
  blocks: [],
  options: OPTIONS,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const item = (code: string) => structuredClone(mockInventory.find((i) => i.code === code)!) as InventoryItem;

const line = (id: string, over: Partial<DocumentLineInput> = {}): DocumentLineInput => ({
  id,
  description: `Line ${id}`,
  quantity: 1,
  unitPrice: 100,
  lineTotal: 100,
  ...over,
});

const render = (over: Partial<RenderInput> & Pick<RenderInput, "template">): RenderInput => ({
  lines: [line("L1")],
  amounts: { subtotal: 100, total: 100 },
  currency: "USD",
  fields: BUILT_IN_FIELDS,
  formatters,
  ...over,
});

/* ------------------------------------------------------------------ columns */

describe("column resolution", () => {
  it("keeps columns in the template's order", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "line", field: "lineTotal" }), col({ kind: "line", field: "description" })]) })
    );
    expect(result.columns.map((c) => c.header)).toEqual(["Total", "Description"]);
  });

  it("uses an explicit header over the source's own label", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "code" }, { header: "SKU", hideWhenEmpty: false })]) })
    );
    expect(result.columns[0].header).toBe("SKU");
  });

  it("still collapses an empty column that has an explicit header — a custom name is not a reason to print nothing", () => {
    const result = renderLineTable(render({ template: template([col({ kind: "catalogField", fieldKey: "code" }, { header: "SKU" })]) }));
    expect(result.columns).toHaveLength(0);
  });

  it("falls back to the catalog label with its unit appended", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.caratWeight" }, { hideWhenEmpty: false })]) })
    );
    expect(result.columns[0].header).toBe("Carat (ct)");
  });

  it("prints no header for an empty string, which is what an index column wants", () => {
    const result = renderLineTable(render({ template: template([col({ kind: "index" }, { header: "", hideWhenEmpty: false })]) }));
    expect(result.columns[0].header).toBe("");
  });

  it("numbers rows from one for an index column", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "index" }, { hideWhenEmpty: false })]), lines: [line("L1"), line("L2"), line("L3")] })
    );
    expect(result.rows.map((r) => r.cells[0])).toEqual(["1", "2", "3"]);
  });

  it("drops a column whose catalog field no longer exists, and says so", () => {
    const result = renderLineTable(render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.notAThing" })]) }));
    expect(result.columns).toHaveLength(0);
    expect(result.diagnostics).toContainEqual({ columnId: expect.any(String), reason: "unknownField", detail: "diamond.notAThing" });
  });

  it("keeps a deactivated field but flags it — items still hold values for it", () => {
    const deactivated: FieldDefinition[] = BUILT_IN_FIELDS.map((f) => (f.key === "diamond.color" ? { ...f, active: false } : f));
    const result = renderLineTable(
      render({
        template: template([col({ kind: "catalogField", fieldKey: "diamond.color" }, { hideWhenEmpty: false })]),
        fields: deactivated,
      })
    );
    expect(result.columns).toHaveLength(1);
    expect(result.diagnostics.map((d) => d.reason)).toContain("inactiveField");
  });

  it("never renders a disabled column", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "line", field: "description" }, { enabled: false }), col({ kind: "line", field: "lineTotal" })]) })
    );
    expect(result.columns).toHaveLength(1);
    expect(result.diagnostics.map((d) => d.reason)).toContain("disabled");
  });
});

/* ------------------------------------------------------------------ values */

describe("value resolution", () => {
  it("reads every line field", () => {
    const result = renderLineTable(
      render({
        template: template(
          [
            col({ kind: "line", field: "description" }),
            col({ kind: "line", field: "quantity" }),
            col({ kind: "line", field: "unitPrice" }),
            col({ kind: "line", field: "lineTotal" }),
          ],
          {}
        ),
        lines: [line("L1", { description: "Ring", quantity: 3, unitPrice: 50, lineTotal: 150 })],
      })
    );
    expect(result.rows[0].cells).toEqual(["Ring", "3", "USD 50.00", "USD 150.00"]);
  });

  it("resolves a deep catalog path off the linked item", () => {
    const result = renderLineTable(
      render({
        template: template([col({ kind: "catalogField", fieldKey: "diamond.clarity" })]),
        lines: [line("L1", { item: item("D-1042") })],
      })
    );
    expect(result.rows[0].cells[0]).toBe("VS1");
  });

  it("prints a boolean as Yes/No", () => {
    const stone = item("D-1042");
    stone.diamond!.isLabGrown = true;
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.isLabGrown" })]), lines: [line("L1", { item: stone })] })
    );
    expect(result.rows[0].cells[0]).toBe("Yes");
  });

  it("comma-joins a multiselect so it reads as one cell", () => {
    const watch = item("W-3010");
    watch.watch!.features = ["Chronograph", "GMT"];
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "watch.features" })]), lines: [line("L1", { item: watch })] })
    );
    expect(result.rows[0].cells[0]).toBe("Chronograph, GMT");
  });

  it("treats decimals as a maximum, not a fixed count", () => {
    const stone = item("D-1042");
    stone.diamond!.caratWeight = 1.5;
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.caratWeight" })]), lines: [line("L1", { item: stone })] })
    );
    // The field declares decimals: 3, but a round number should not print "1.500".
    expect(result.rows[0].cells[0]).toBe("1.5");
  });

  it("yields a blank for a free-text line and does not throw", () => {
    const result = renderLineTable(
      render({
        template: template([col({ kind: "catalogField", fieldKey: "diamond.color" }, { hideWhenEmpty: false })]),
        lines: [line("L1", { item: undefined })],
      })
    );
    expect(result.rows[0].cells[0]).toBe("");
  });

  it("resolves a line field that does not exist on the document yet as blank, not NaN", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "line", field: "lineDiscount" }, { hideWhenEmpty: false })]) })
    );
    expect(result.rows[0].cells[0]).toBe("");
  });

  it("honours an explicit format over the inferred one", () => {
    const result = renderLineTable(
      render({ template: template([col({ kind: "line", field: "unitPrice" }, { format: "number" })]), lines: [line("L1", { unitPrice: 50 })] })
    );
    expect(result.rows[0].cells[0]).toBe("50");
  });

  it("formats a date field through the injected formatter", () => {
    const stone = item("D-1042");
    stone.diamond!.certificateDate = "2026-03-04";
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.certificateDate" })]), lines: [line("L1", { item: stone })] })
    );
    expect(result.rows[0].cells[0]).toBe("D(2026-03-04)");
  });
});

/* ------------------------------------------------------------------ auto-hide: the crux */

describe("auto-hide", () => {
  const colourCol = () => col({ kind: "catalogField", fieldKey: "diamond.color" });

  it("collapses a column blank on every line", () => {
    const result = renderLineTable(render({ template: template([colourCol()]), lines: [line("L1"), line("L2")] }));
    expect(result.columns).toHaveLength(0);
    expect(result.diagnostics.map((d) => d.reason)).toContain("emptyOnEveryLine");
  });

  it("keeps a blank column when hideWhenEmpty is off", () => {
    const result = renderLineTable(render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.color" }, { hideWhenEmpty: false })]) }));
    expect(result.columns).toHaveLength(1);
  });

  it("keeps a column blank on only SOME lines — the mixed-category case", () => {
    const result = renderLineTable(
      render({
        template: template([colourCol()]),
        // A diamond and a watch on one invoice: colour applies to one of them.
        lines: [line("L1", { item: item("D-1042") }), line("L2", { item: item("W-3010") })],
      })
    );
    expect(result.columns).toHaveLength(1);
    expect(result.rows[0].cells[0]).toBe("F");
    expect(result.rows[1].cells[0]).toBe("");
  });

  it("does not treat 0 as empty", () => {
    const result = renderLineTable(render({ template: template([col({ kind: "line", field: "quantity" })]), lines: [line("L1", { quantity: 0 })] }));
    expect(result.columns).toHaveLength(1);
    expect(result.rows[0].cells[0]).toBe("0");
  });

  it("does not treat false as empty — a 'Lab grown: No' column must survive", () => {
    const stone = item("D-1042");
    stone.diamond!.isLabGrown = false;
    const result = renderLineTable(
      render({ template: template([col({ kind: "catalogField", fieldKey: "diamond.isLabGrown" })]), lines: [line("L1", { item: stone })] })
    );
    expect(result.columns).toHaveLength(1);
    expect(result.rows[0].cells[0]).toBe("No");
  });

  it("does not collapse anything on a document with no lines", () => {
    const result = renderLineTable(render({ template: template([colourCol()]), lines: [] }));
    expect(result.columns).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ unidentified lines */

describe("unidentified lines", () => {
  const moneyOnly = () => template([col({ kind: "line", field: "lineTotal" }, { hideWhenEmpty: false })]);

  it("flags a line that would print as a bare amount", () => {
    const result = renderLineTable(render({ template: moneyOnly(), lines: [line("L1", { description: "Labour" })] }));
    expect(result.diagnostics).toContainEqual({ columnId: "L1", reason: "unidentifiedLine", detail: "Labour" });
  });

  it("does not flag a line a description column names", () => {
    const withDescription = template([
      col({ kind: "line", field: "description" }, { hideWhenEmpty: false }),
      col({ kind: "line", field: "lineTotal" }, { hideWhenEmpty: false }),
    ]);
    const result = renderLineTable(render({ template: withDescription, lines: [line("L1", { description: "Labour" })] }));
    expect(result.diagnostics.some((d) => d.reason === "unidentifiedLine")).toBe(false);
  });

  it("does not flag a line a catalog column names", () => {
    const withCode = template([
      col({ kind: "catalogField", fieldKey: "code" }, { hideWhenEmpty: false }),
      col({ kind: "line", field: "lineTotal" }, { hideWhenEmpty: false }),
    ]);
    const result = renderLineTable(render({ template: withCode, lines: [line("L1", { item: item("D-1042") })] }));
    expect(result.diagnostics.some((d) => d.reason === "unidentifiedLine")).toBe(false);
  });

  it("flags only the free-text line on a mixed invoice", () => {
    const withCode = template([
      col({ kind: "catalogField", fieldKey: "code" }, { hideWhenEmpty: false }),
      col({ kind: "line", field: "lineTotal" }, { hideWhenEmpty: false }),
    ]);
    const result = renderLineTable(
      render({ template: withCode, lines: [line("L1", { item: item("D-1042") }), line("L2", { description: "Labour" })] })
    );
    const flagged = result.diagnostics.filter((d) => d.reason === "unidentifiedLine").map((d) => d.columnId);
    expect(flagged).toEqual(["L2"]);
  });

  it("does not count an index or quantity column as naming the line", () => {
    const noName = template([
      col({ kind: "index" }, { hideWhenEmpty: false }),
      col({ kind: "line", field: "quantity" }, { hideWhenEmpty: false }),
      col({ kind: "line", field: "lineTotal" }, { hideWhenEmpty: false }),
    ]);
    const result = renderLineTable(render({ template: noName, lines: [line("L1", { description: "Labour" })] }));
    expect(result.diagnostics.some((d) => d.reason === "unidentifiedLine")).toBe(true);
  });
});

/* ------------------------------------------------------------------ widths */

describe("widths", () => {
  const sum = (widths: number[]) => widths.reduce((total, w) => total + w, 0);

  it("normalises weights to 100", () => {
    expect(sum(normaliseWidths([5, 1, 1, 1]).widths)).toBeCloseTo(100, 6);
  });

  it("gives a single column the whole table", () => {
    expect(normaliseWidths([3]).widths).toEqual([100]);
  });

  it("treats zero and nonsense weights as 1 rather than dividing by zero", () => {
    const { widths } = normaliseWidths([0, Number.NaN, 2]);
    expect(sum(widths)).toBeCloseTo(100, 6);
    expect(widths.every((w) => w > 0)).toBe(true);
  });

  it("clamps a starved column to a readable floor and still sums to 100", () => {
    const { widths, clamped } = normaliseWidths([40, 1, 1, 1]);
    expect(clamped.filter(Boolean).length).toBeGreaterThan(0);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(6);
    expect(sum(widths)).toBeCloseTo(100, 6);
  });

  it("shares the table equally when even the floor cannot be honoured", () => {
    const { widths, clamped } = normaliseWidths(Array.from({ length: 20 }, () => 1));
    expect(sum(widths)).toBeCloseTo(100, 6);
    expect(clamped.every(Boolean)).toBe(true);
  });

  it("is empty for no columns", () => {
    expect(normaliseWidths([])).toEqual({ widths: [], clamped: [] });
  });

  it("re-normalises to 100 after a column auto-hides", () => {
    const result = renderLineTable(
      render({
        template: template([
          col({ kind: "line", field: "description" }, { widthWeight: 5, hideWhenEmpty: false }),
          col({ kind: "catalogField", fieldKey: "diamond.color" }, { widthWeight: 1 }),
          col({ kind: "line", field: "lineTotal" }, { widthWeight: 2, hideWhenEmpty: false }),
        ]),
      })
    );
    expect(result.columns).toHaveLength(2);
    expect(sum(result.columns.map((c) => c.widthPct))).toBeCloseTo(100, 1);
  });

  it("reports a clamped width as a diagnostic", () => {
    const result = renderLineTable(
      render({
        template: template([
          col({ kind: "line", field: "description" }, { widthWeight: 60, hideWhenEmpty: false }),
          col({ kind: "line", field: "quantity" }, { widthWeight: 1, hideWhenEmpty: false }),
          col({ kind: "line", field: "lineTotal" }, { widthWeight: 1, hideWhenEmpty: false }),
        ]),
      })
    );
    expect(result.diagnostics.map((d) => d.reason)).toContain("clampedWidth");
  });
});

/* ------------------------------------------------------------------ totals */

describe("totals", () => {
  const amounts = { subtotal: 1_000, discount: 100, tax: 90, shipping: 50, total: 1_040, paid: 400 };

  it("computes the balance as total minus paid", () => {
    const rows = renderTotals(template([]), amounts, "USD", formatters);
    expect(rows.find((r) => r.key === "balance")?.text).toBe("USD 640.00");
  });

  it("prints a discount as a reduction", () => {
    const rows = renderTotals(template([]), amounts, "USD", formatters);
    expect(rows.find((r) => r.key === "discount")?.text).toBe("−USD 100.00");
  });

  it("drops a zero row when hideWhenZero is set", () => {
    const rows = renderTotals(template([], { totals: allTotals({ hideWhenZero: true }) }), { subtotal: 100, total: 100 }, "USD", formatters);
    expect(rows.map((r) => r.key)).not.toContain("shipping");
  });

  it("keeps a zero row when hideWhenZero is not set", () => {
    const rows = renderTotals(template([]), { subtotal: 100, total: 100 }, "USD", formatters);
    expect(rows.map((r) => r.key)).toContain("shipping");
  });

  it("renders the total even when switched off — a document with no total is not a document", () => {
    const totals = allTotals().map((row) => (row.key === "total" ? { ...row, show: false, hideWhenZero: true } : row));
    const rows = renderTotals(template([], { totals }), { subtotal: 0, total: 0 }, "USD", formatters);
    expect(rows.map((r) => r.key)).toContain("total");
  });

  it("uses a renamed label", () => {
    const totals = allTotals().map((row) => (row.key === "tax" ? { ...row, label: "GST 18%" } : row));
    const rows = renderTotals(template([], { totals }), amounts, "USD", formatters);
    expect(rows.find((r) => r.key === "tax")?.label).toBe("GST 18%");
  });

  it("omits a row that is switched off", () => {
    const totals = allTotals().map((row) => (row.key === "paid" ? { ...row, show: false } : row));
    const rows = renderTotals(template([], { totals }), amounts, "USD", formatters);
    expect(rows.map((r) => r.key)).not.toContain("paid");
  });

  it("treats missing optional amounts as zero", () => {
    const rows = renderTotals(template([]), { subtotal: 100, total: 100 }, "USD", formatters);
    expect(rows.find((r) => r.key === "tax")?.text).toBe("USD 0.00");
    expect(rows.find((r) => r.key === "balance")?.text).toBe("USD 100.00");
  });
});

/* ------------------------------------------------------------------ text blocks */

describe("text blocks", () => {
  const block = (over: Partial<TextBlock> = {}): TextBlock => ({
    id: "b1",
    kind: "terms",
    slot: "belowTotals",
    heading: "Terms",
    source: "template",
    body: "Net 30.",
    show: true,
    sortOrder: 1,
    ...over,
  });

  it("prints a template block's stored body", () => {
    expect(renderBlocks(template([], { blocks: [block()] }))).toEqual([{ id: "b1", kind: "terms", slot: "belowTotals", heading: "Terms", body: "Net 30." }]);
  });

  it("pulls a document block's body from the document's own notes", () => {
    const blocks = renderBlocks(template([], { blocks: [block({ kind: "notes", source: "document", body: "ignored" })] }), "Insured shipping.");
    expect(blocks[0].body).toBe("Insured shipping.");
  });

  it("drops a document block when there are no notes, rather than printing an empty heading", () => {
    expect(renderBlocks(template([], { blocks: [block({ source: "document" })] }), "")).toEqual([]);
  });

  it("drops a hidden block", () => {
    expect(renderBlocks(template([], { blocks: [block({ show: false })] }))).toEqual([]);
  });

  it("keeps a signature block with an empty body — the ruled line is the point", () => {
    const blocks = renderBlocks(template([], { blocks: [block({ kind: "signature", body: "" })] }));
    expect(blocks).toHaveLength(1);
  });

  it("orders by slot, then by sortOrder within a slot", () => {
    const blocks = renderBlocks(
      template([], {
        blocks: [
          block({ id: "b-footer", slot: "footer", sortOrder: 1 }),
          block({ id: "b-below-2", slot: "belowTotals", sortOrder: 2 }),
          block({ id: "b-below-1", slot: "belowTotals", sortOrder: 1 }),
          block({ id: "b-header", slot: "underHeader", sortOrder: 1 }),
        ],
      })
    );
    expect(blocks.map((b) => b.id)).toEqual(["b-header", "b-below-1", "b-below-2", "b-footer"]);
  });
});

/* ------------------------------------------------------------------ compose */

describe("renderDocument", () => {
  it("returns columns, rows, totals, blocks and the template's options together", () => {
    const result = renderDocument(render({ template: template([col({ kind: "line", field: "description" }, { hideWhenEmpty: false })]) }));
    expect(result.columns).toHaveLength(1);
    expect(result.rows).toHaveLength(1);
    expect(result.totals.length).toBeGreaterThan(0);
    expect(result.options).toEqual(OPTIONS);
  });

  it("keeps cells positionally parallel to columns", () => {
    const result = renderDocument(
      render({
        template: template([
          col({ kind: "catalogField", fieldKey: "diamond.color" }),
          col({ kind: "line", field: "description" }, { hideWhenEmpty: false }),
          col({ kind: "line", field: "lineTotal" }, { hideWhenEmpty: false }),
        ]),
      })
    );
    // The colour column auto-hid, so every row must be two cells wide, not three.
    expect(result.columns).toHaveLength(2);
    result.rows.forEach((row) => expect(row.cells).toHaveLength(result.columns.length));
  });
});

/* ------------------------------------------------------------------ built-in integrity */

describe("built-in template integrity", () => {
  const fieldKeys = new Set(BUILT_IN_FIELDS.map((f) => f.key));

  it("gives every built-in a unique id", () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every column within a template a unique id", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const ids = t.columns.map((c) => c.id);
      expect(new Set(ids).size, `${t.id} has duplicate column ids`).toBe(ids.length);
    }
  });

  // This is the test that catches a mistyped field key at CI rather than on a customer's invoice.
  it("references only catalog fields that actually exist", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      for (const c of t.columns) {
        if (c.source.kind === "catalogField") expect(fieldKeys, `${t.id} → ${c.source.fieldKey}`).toContain(c.source.fieldKey);
      }
    }
  });

  it("declares exactly one totals row per key", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.totals.map((r) => r.key).sort()).toEqual([...TOTALS_ROW_KEYS].sort());
    }
  });

  it("has at least one enabled column and at least one money column", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const enabled = t.columns.filter((c) => c.enabled);
      expect(enabled.length, t.id).toBeGreaterThan(0);
      const hasMoney = enabled.some((c) => c.source.kind === "line" && (c.source.field === "lineTotal" || c.source.field === "unitPrice"));
      expect(hasMoney, `${t.id} prints no amounts`).toBe(true);
    }
  });

  it("stays within the column count its orientation can carry", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const enabled = t.columns.filter((c) => c.enabled).length;
      expect(enabled, `${t.id} has too many columns for ${t.options.landscape ? "landscape" : "portrait"}`).toBeLessThanOrEqual(t.options.landscape ? 12 : 8);
    }
  });

  it.each(BUILT_IN_TEMPLATES.map((t) => [t.name, t] as const))("renders %s against real inventory without throwing", (_name, t) => {
    const lines = [line("L1", { item: item("D-1042") }), line("L2", { item: item("J-2031") }), line("L3", { item: undefined })];
    const result = renderDocument(render({ template: t, lines }));
    expect(result.columns.length).toBeGreaterThan(0);
    result.rows.forEach((row) => expect(row.cells).toHaveLength(result.columns.length));
  });

  it("always resolves a starter for every kind", () => {
    expect(builtInTemplate("invoice").kind).toBe("invoice");
    // Memo and PO have no starter of their own yet, so they fall back rather than returning undefined.
    expect(builtInTemplate("memo")).toBeDefined();
    expect(builtInTemplate("purchaseOrder")).toBeDefined();
  });

  it("gives every built-in a way to name a free-text line", () => {
    // A layout that can't identify a labour or freight charge prints it as a bare number.
    for (const t of BUILT_IN_TEMPLATES) {
      const result = renderDocument(render({ template: t, lines: [line("L1", { description: "Setting labour", item: undefined })] }));
      expect(result.diagnostics.some((d) => d.reason === "unidentifiedLine"), `${t.id} cannot name a free-text line`).toBe(false);
    }
  });

  it("reproduces the pre-template invoice layout in Standard", () => {
    const standard = BUILT_IN_TEMPLATES.find((t) => t.id === "builtin.invoice.standard")!;
    const result = renderDocument(
      render({ template: standard, lines: [line("L1", { item: item("D-1042"), quantity: 1, unitPrice: 9_400, lineTotal: 9_400 })] })
    );
    expect(result.columns.map((c) => c.header)).toEqual(["Stock #", "Description", "Qty", "Unit price", "Total"]);
  });

  it("collapses Standard's qty and unit price for a memo-shaped line that carries neither", () => {
    const standard = BUILT_IN_TEMPLATES.find((t) => t.id === "builtin.invoice.standard")!;
    const result = renderDocument(
      render({ template: standard, lines: [{ id: "L1", description: "Stone on memo", lineTotal: 4_650 }] })
    );
    expect(result.columns.map((c) => c.header)).toEqual(["Description", "Total"]);
  });
});
