import {
  DocumentTemplateError,
  createTemplate,
  deleteTemplate,
  getDefaultTemplateId,
  getTemplate,
  isDefaultTemplate,
  listTemplates,
  resolveTemplateFor,
  setDefaultTemplate,
  setTemplateHidden,
  updateTemplate,
} from "@/lib/api/documentTemplateApi";
import { BUILT_IN_TEMPLATES, builtInTemplate } from "@/lib/document/builtInTemplates";
import { buildProposedTemplate, proposeColumns } from "@/lib/document/proposeTemplate";
import { renderLegacyDocument } from "@/lib/document/legacyDocument";
import type { DocumentFormatters, DocumentLineInput } from "@/lib/document/renderDocument";
import { BUILT_IN_FIELDS } from "@/lib/inventory/builtInFields";
import { mockInventory } from "@/data/mockInventory";
import { installMemoryStorage } from "@/test/memoryStorage";
import type { InventoryItem } from "@/types/inventory";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  installMemoryStorage();
});

const STANDARD = "builtin.invoice.standard";
const DIAMOND = "builtin.invoice.diamondDetail";

const item = (code: string) => structuredClone(mockInventory.find((i) => i.code === code)!) as InventoryItem;

const formatters: DocumentFormatters = {
  currency: (value, currency) => `${currency} ${value.toFixed(2)}`,
  number: (value) => String(value),
  date: (iso) => iso,
};

/* ------------------------------------------------------------------ reads */

describe("listTemplates", () => {
  it("offers the built-ins before any tenant template", async () => {
    await createTemplate({ kind: "invoice", name: "Aaa custom" });
    const list = await listTemplates("invoice");
    expect(list[0].builtIn).toBe(true);
    expect(list.at(-1)?.name).toBe("Aaa custom");
  });

  it("never mixes kinds", async () => {
    const list = await listTemplates("invoice");
    expect(list.every((template) => template.kind === "invoice")).toBe(true);
  });

  it("hides a hidden built-in, unless asked for it", async () => {
    await setTemplateHidden(DIAMOND, true);
    expect((await listTemplates("invoice")).some((t) => t.id === DIAMOND)).toBe(false);
    expect((await listTemplates("invoice", true)).some((t) => t.id === DIAMOND)).toBe(true);
  });
});

describe("resolveTemplateFor", () => {
  it("prefers the id stamped on the document", async () => {
    expect((await resolveTemplateFor("invoice", DIAMOND)).id).toBe(DIAMOND);
  });

  it("falls back to the tenant default when the document names nothing", async () => {
    await setDefaultTemplate("invoice", DIAMOND);
    expect((await resolveTemplateFor("invoice")).id).toBe(DIAMOND);
  });

  it("falls back to the built-in starter when there is no default — the no-migration path", async () => {
    expect((await resolveTemplateFor("invoice")).id).toBe(STANDARD);
  });

  it("falls through a stamped id that no longer exists rather than rendering nothing", async () => {
    expect((await resolveTemplateFor("invoice", "tpl-deleted")).id).toBe(STANDARD);
  });

  it("falls through a dangling default", async () => {
    const custom = await createTemplate({ kind: "invoice", name: "Temporary" });
    await setDefaultTemplate("invoice", custom.id);
    await deleteTemplate(custom.id);
    expect((await resolveTemplateFor("invoice")).id).toBe(STANDARD);
  });

  it("always resolves something for every kind", async () => {
    for (const kind of ["invoice", "memo", "purchaseOrder"] as const) {
      expect((await resolveTemplateFor(kind)).id).toBeTruthy();
    }
  });
});

describe("isDefaultTemplate", () => {
  it("treats the built-in starter as default when nothing is chosen", () => {
    expect(isDefaultTemplate("invoice", STANDARD)).toBe(true);
  });

  it("moves once a default is chosen", async () => {
    await setDefaultTemplate("invoice", DIAMOND);
    expect(isDefaultTemplate("invoice", DIAMOND)).toBe(true);
    expect(isDefaultTemplate("invoice", STANDARD)).toBe(false);
  });

  it("reports the resolved default id", async () => {
    await setDefaultTemplate("invoice", DIAMOND);
    expect(await getDefaultTemplateId("invoice")).toBe(DIAMOND);
  });
});

/* ------------------------------------------------------------------ writes */

describe("createTemplate", () => {
  it("copies a built-in into an editable tenant template", async () => {
    const created = await createTemplate({ kind: "invoice", name: "My diamond layout", fromId: DIAMOND });
    expect(created.builtIn).toBe(false);
    expect(created.id).not.toBe(DIAMOND);
    expect(created.columns).toHaveLength(builtInTemplate("invoice") && BUILT_IN_TEMPLATES.find((t) => t.id === DIAMOND)!.columns.length);
  });

  it("gives the copy fresh column ids, so diagnostics can't point at the source", async () => {
    const source = BUILT_IN_TEMPLATES.find((t) => t.id === DIAMOND)!;
    const created = await createTemplate({ kind: "invoice", name: "Copy", fromId: DIAMOND });
    expect(created.columns.map((c) => c.id)).not.toEqual(source.columns.map((c) => c.id));
    expect(new Set(created.columns.map((c) => c.id)).size).toBe(created.columns.length);
  });

  it("does not mutate the built-in it copied", async () => {
    const before = structuredClone(BUILT_IN_TEMPLATES.find((t) => t.id === DIAMOND)!);
    const created = await createTemplate({ kind: "invoice", name: "Copy", fromId: DIAMOND });
    // Edit the copy hard: rename a header, drop a column, change orientation.
    await updateTemplate(created.id, {
      name: "Copy edited",
      columns: created.columns.slice(1).map((column, index) => (index === 0 ? { ...column, header: "Changed" } : column)),
      options: { ...created.options, showLogo: false, showPoweredBy: false },
    });
    expect(BUILT_IN_TEMPLATES.find((t) => t.id === DIAMOND)).toEqual(before);
  });

  it("rejects a blank name", async () => {
    await expect(createTemplate({ kind: "invoice", name: "   " })).rejects.toThrow(/name/i);
  });

  it("rejects a name already taken, ignoring case and spacing", async () => {
    await createTemplate({ kind: "invoice", name: "Retail layout" });
    await expect(createTemplate({ kind: "invoice", name: "retail  LAYOUT" })).rejects.toThrow(DocumentTemplateError);
  });

  it("rejects a name that clashes with a built-in", async () => {
    await expect(createTemplate({ kind: "invoice", name: "Standard" })).rejects.toThrow(/already exists/i);
  });
});

describe("updateTemplate", () => {
  it("refuses to edit a built-in and says to duplicate it", async () => {
    await expect(updateTemplate(STANDARD, { name: "Nope" })).rejects.toThrow(/duplicate/i);
  });

  it("saves a rename", async () => {
    const created = await createTemplate({ kind: "invoice", name: "First" });
    const renamed = await updateTemplate(created.id, { name: "Second" });
    expect(renamed.name).toBe("Second");
  });

  it("lets a template keep its own name", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Keep" });
    await expect(updateTemplate(created.id, { name: "Keep" })).resolves.toBeDefined();
  });

  it("stamps updatedAt", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Stamped" });
    const updated = await updateTemplate(created.id, { name: "Stamped again" });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
  });

  it("rejects a template with every column switched off", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Empty" });
    const columns = created.columns.map((column) => ({ ...column, enabled: false }));
    await expect(updateTemplate(created.id, { columns })).rejects.toThrow(/at least one column/i);
  });

  it("rejects a template that prints no amounts", async () => {
    const created = await createTemplate({ kind: "invoice", name: "No money" });
    const columns = created.columns.filter((column) => !(column.source.kind === "line" && (column.source.field === "lineTotal" || column.source.field === "unitPrice")));
    await expect(updateTemplate(created.id, { columns })).rejects.toThrow(/amounts/i);
  });

  it("rejects more columns than portrait can print, and names landscape as the way out", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Wide", fromId: DIAMOND });
    const portrait = { ...created.options, landscape: false };
    await expect(updateTemplate(created.id, { options: portrait })).rejects.toThrow(/landscape/i);
  });

  it("accepts the same column count in landscape", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Wide ok", fromId: DIAMOND });
    await expect(updateTemplate(created.id, { options: { ...created.options, landscape: true } })).resolves.toBeDefined();
  });

  it("rejects an out-of-range column width", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Bad width" });
    const columns = created.columns.map((column, index) => (index === 0 ? { ...column, widthWeight: 0 } : column));
    await expect(updateTemplate(created.id, { columns })).rejects.toThrow(/width/i);
  });

  it("rejects duplicate column ids", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Dupes" });
    const columns = [...created.columns, { ...created.columns[0] }];
    await expect(updateTemplate(created.id, { columns })).rejects.toThrow(/id/i);
  });

  it("refuses to edit something already deleted", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Gone" });
    await deleteTemplate(created.id);
    await expect(updateTemplate(created.id, { name: "Back" })).rejects.toThrow(/no longer exists/i);
  });
});

describe("deleteTemplate", () => {
  it("removes a tenant template", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Temp" });
    await deleteTemplate(created.id);
    expect(await getTemplate(created.id)).toBeUndefined();
  });

  it("refuses to delete a built-in and offers hiding instead", async () => {
    await expect(deleteTemplate(STANDARD)).rejects.toThrow(/hide/i);
  });

  it("is a no-op for an unknown id", async () => {
    await expect(deleteTemplate("tpl-nope")).resolves.toBeUndefined();
  });
});

describe("setTemplateHidden", () => {
  it("refuses to hide the current default, so nothing is left pointing at nothing", async () => {
    await setDefaultTemplate("invoice", DIAMOND);
    await expect(setTemplateHidden(DIAMOND, true)).rejects.toThrow(/default/i);
  });

  it("refuses to hide a tenant template — those are deleted", async () => {
    const created = await createTemplate({ kind: "invoice", name: "Mine" });
    await expect(setTemplateHidden(created.id, true)).rejects.toThrow(/built-in/i);
  });

  it("un-hides", async () => {
    await setTemplateHidden(DIAMOND, true);
    await setTemplateHidden(DIAMOND, false);
    expect((await listTemplates("invoice")).some((t) => t.id === DIAMOND)).toBe(true);
  });
});

describe("setDefaultTemplate", () => {
  it("rejects a template belonging to another kind", async () => {
    await expect(setDefaultTemplate("memo", DIAMOND)).rejects.toThrow(/invoice/i);
  });

  it("rejects an unknown id", async () => {
    await expect(setDefaultTemplate("invoice", "tpl-nope")).rejects.toThrow(/no longer exists/i);
  });
});

/* ------------------------------------------------------------------ propose */

describe("proposeColumns", () => {
  const base = BUILT_IN_TEMPLATES.find((t) => t.id === STANDARD)!;
  const lines: DocumentLineInput[] = [
    { id: "L1", description: "Stone", lineTotal: 9_400, item: item("D-1042") },
    { id: "L2", description: "Labour", lineTotal: 650 },
  ];

  it("proposes fields that actually carry a value on the document", () => {
    const proposed = proposeColumns({ base, lines, fields: BUILT_IN_FIELDS });
    const keys = proposed.map((p) => (p.column.source as { fieldKey: string }).fieldKey);
    expect(keys).toContain("diamond.caratWeight");
    expect(keys).toContain("diamond.color");
  });

  it("does not propose a field that is blank on every line", () => {
    const proposed = proposeColumns({ base, lines, fields: BUILT_IN_FIELDS });
    const keys = proposed.map((p) => (p.column.source as { fieldKey: string }).fieldKey);
    expect(keys).not.toContain("watch.brand");
  });

  it("does not re-propose a column the template already shows", () => {
    const proposed = proposeColumns({ base, lines, fields: BUILT_IN_FIELDS });
    const keys = proposed.map((p) => (p.column.source as { fieldKey: string }).fieldKey);
    // Standard already carries `code`.
    expect(keys).not.toContain("code");
  });

  it("never proposes internal cost", () => {
    const proposed = proposeColumns({ base, lines, fields: BUILT_IN_FIELDS });
    const keys = proposed.map((p) => (p.column.source as { fieldKey: string }).fieldKey);
    expect(keys).not.toContain("cost");
  });

  it("reports how many lines each proposal covers", () => {
    const proposed = proposeColumns({ base, lines, fields: BUILT_IN_FIELDS });
    expect(proposed.every((p) => p.presentOn >= 1)).toBe(true);
    expect(proposed.find((p) => (p.column.source as { fieldKey: string }).fieldKey === "diamond.color")?.presentOn).toBe(1);
  });

  it("proposes nothing for a document of only free-text lines", () => {
    expect(proposeColumns({ base, lines: [{ id: "L1", description: "Repair", lineTotal: 100 }], fields: BUILT_IN_FIELDS })).toEqual([]);
  });
});

describe("buildProposedTemplate", () => {
  const base = BUILT_IN_TEMPLATES.find((t) => t.id === STANDARD)!;

  it("inserts the accepted columns before the money columns", () => {
    const accepted = proposeColumns({
      base,
      lines: [{ id: "L1", description: "Stone", lineTotal: 1, item: item("D-1042") }],
      fields: BUILT_IN_FIELDS,
    })
      .slice(0, 2)
      .map((p) => p.column);

    const built = buildProposedTemplate({ base, accepted, name: "Proposed", id: "tpl-9" });
    const headers = built.columns.map((c) => (c.source.kind === "line" ? c.source.field : c.source.kind));
    const firstMoney = headers.findIndex((h) => h === "unitPrice" || h === "lineTotal");
    const lastAccepted = built.columns.findIndex((c) => c.id === accepted.at(-1)!.id);
    expect(lastAccepted).toBeLessThan(firstMoney);
  });

  it("is not built-in and carries the given name and id", () => {
    const built = buildProposedTemplate({ base, accepted: [], name: "  Trimmed  ", id: "tpl-3" });
    expect(built).toMatchObject({ id: "tpl-3", name: "Trimmed", builtIn: false });
  });
});

/* ------------------------------------------------------------------ legacy adapter */

describe("renderLegacyDocument", () => {
  it("reproduces the four-column invoice layout for invoice-shaped props", () => {
    const rendered = renderLegacyDocument(
      { lines: [{ description: "Stone", qty: 1, unitPrice: 100, total: 100 }], currency: "USD", subtotal: 100, total: 100 },
      formatters
    );
    expect(rendered.columns.map((c) => c.header)).toEqual(["Description", "Qty", "Unit price", "Total"]);
  });

  it("collapses qty and unit price for memo-shaped lines that carry neither", () => {
    const rendered = renderLegacyDocument(
      { lines: [{ description: "Stone on memo", total: 4_650 }], currency: "USD", subtotal: 4_650, total: 4_650 },
      formatters
    );
    expect(rendered.columns.map((c) => c.header)).toEqual(["Description", "Total"]);
  });

  it("uses the caller's tax label", () => {
    const rendered = renderLegacyDocument(
      { lines: [{ description: "x", total: 100 }], currency: "USD", subtotal: 100, tax: 8, taxLabel: "GST (18%)", total: 108 },
      formatters
    );
    expect(rendered.totals.find((row) => row.key === "tax")?.label).toBe("GST (18%)");
  });

  it("hides paid and balance, which a memo or PO has no concept of", () => {
    const rendered = renderLegacyDocument({ lines: [{ description: "x", total: 100 }], currency: "USD", subtotal: 100, total: 100 }, formatters);
    const keys = rendered.totals.map((row) => row.key);
    expect(keys).not.toContain("paid");
    expect(keys).not.toContain("balance");
  });

  it("prints the caller's notes", () => {
    const rendered = renderLegacyDocument(
      { lines: [{ description: "x", total: 1 }], currency: "USD", subtotal: 1, total: 1, notes: "Insured." },
      formatters
    );
    expect(rendered.blocks.map((b) => b.body)).toContain("Insured.");
  });

  it("survives a document with no lines at all", () => {
    const rendered = renderLegacyDocument({ lines: [], currency: "USD", subtotal: 0, total: 0 }, formatters);
    expect(rendered.rows).toEqual([]);
    expect(rendered.totals.some((row) => row.key === "total")).toBe(true);
  });
});
