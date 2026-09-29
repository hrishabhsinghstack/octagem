import {
  InvoiceStateError,
  createInvoice,
  deleteDraftInvoice,
  getInvoice,
  issueInvoice,
  listInvoices,
  recordInvoiceSend,
  updateDraftInvoice,
  voidInvoice,
  type InvoicePayload,
} from "@/lib/api/invoiceApi";
import { getById as getItem } from "@/lib/store/inventoryStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  installMemoryStorage();
});

/** D-1042 is seeded Available and owned outright, so selling it has no consignment side effects. */
const STONE = "D-1042";

const payload = (over: Partial<InvoicePayload> = {}): InvoicePayload => ({
  customerId: "C-2001",
  salesperson: "Devesh Rao",
  currency: "USD",
  lines: [{ itemId: STONE, description: "D-1042 · 1.21ct Round Brilliant", quantity: 1, unitPrice: 9_400 }],
  ...over,
});

describe("createInvoice", () => {
  it("defaults to a Draft that owes nothing", async () => {
    const invoice = await createInvoice(payload());
    expect(invoice.status).toBe("Draft");
    expect(invoice.paidAmount).toBe(0);
    expect(invoice.sends).toEqual([]);
    expect(invoice.sentAt).toBeUndefined();
  });

  it("leaves the stock Available — a draft commits nothing", async () => {
    await createInvoice(payload());
    expect(getItem(STONE)?.status).toBe("Available");
  });

  it("issues immediately and sells the stock when asked", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    expect(invoice.status).toBe("Open");
    expect(getItem(STONE)?.status).toBe("Sold");
  });

  it("computes totals from the lines and charges", async () => {
    const invoice = await createInvoice(payload({ discount: 400, shipping: 100 }));
    expect(invoice.subtotal).toBe(9_400);
    expect(invoice.discount).toBe(400);
    expect(invoice.total).toBe(9_100);
  });

  it("accepts a free-text line with no inventory behind it", async () => {
    const invoice = await createInvoice(payload({ lines: [{ description: "Resizing", quantity: 2, unitPrice: 60 }] }));
    expect(invoice.lines[0].itemId).toBeUndefined();
    expect(invoice.lines[0].lineTotal).toBe(120);
    expect(invoice.total).toBe(120);
  });

  it("issues a free-text-only invoice without touching inventory", async () => {
    const invoice = await createInvoice(payload({ lines: [{ description: "Laser inscription", quantity: 1, unitPrice: 75 }] }), { issue: true });
    expect(invoice.status).toBe("Open");
    expect(getItem(STONE)?.status).toBe("Available");
  });

  it("sells only the stock lines of a mixed invoice", async () => {
    await createInvoice(
      payload({
        lines: [
          { itemId: STONE, description: "Stone", quantity: 1, unitPrice: 9_400 },
          { description: "Setting labour", quantity: 1, unitPrice: 650 },
        ],
      }),
      { issue: true }
    );
    expect(getItem(STONE)?.status).toBe("Sold");
  });
});

describe("updateDraftInvoice", () => {
  it("replaces lines and recomputes the total", async () => {
    const draft = await createInvoice(payload());
    const updated = await updateDraftInvoice(draft.id, payload({ lines: [{ description: "Repair only", quantity: 1, unitPrice: 200 }] }));
    expect(updated.lines).toHaveLength(1);
    expect(updated.total).toBe(200);
  });

  it("refuses to edit an issued invoice", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    await expect(updateDraftInvoice(invoice.id, payload())).rejects.toThrow(InvoiceStateError);
  });

  it("keeps the exchange rate struck at creation", async () => {
    const draft = await createInvoice(payload());
    const updated = await updateDraftInvoice(draft.id, payload({ lines: [{ description: "x", quantity: 1, unitPrice: 5 }] }));
    expect(updated.fxRateToBase).toBe(draft.fxRateToBase);
  });

  it("does not resurrect a deleted draft", async () => {
    const draft = await createInvoice(payload());
    await deleteDraftInvoice(draft.id);
    await expect(updateDraftInvoice(draft.id, payload())).rejects.toThrow(InvoiceStateError);
  });
});

describe("issueInvoice", () => {
  it("moves Draft to Open and stamps today as the issue date", async () => {
    const draft = await createInvoice(payload());
    const issued = await issueInvoice(draft.id);
    expect(issued?.status).toBe("Open");
    expect(issued?.issuedAt).toBe(new Date().toISOString().slice(0, 10));
  });

  it("writes a SALE movement onto the item's ledger", async () => {
    const before = getItem(STONE)?.ledger.length ?? 0;
    const draft = await createInvoice(payload());
    await issueInvoice(draft.id);
    const after = getItem(STONE);
    expect(after?.ledger.length).toBe(before + 1);
    // The ledger is newest-first — inventoryStore.update prepends.
    expect(after?.ledger[0].type).toBe("SALE");
    expect(after?.ledger[0].note).toContain(draft.id);
  });

  it("adds no ledger movement for a free-text line", async () => {
    const before = getItem(STONE)?.ledger.length ?? 0;
    const draft = await createInvoice(payload({ lines: [{ description: "Polishing", quantity: 1, unitPrice: 50 }] }));
    await issueInvoice(draft.id);
    expect(getItem(STONE)?.ledger.length).toBe(before);
  });

  it("refuses to issue twice", async () => {
    const draft = await createInvoice(payload());
    await issueInvoice(draft.id);
    await expect(issueInvoice(draft.id)).rejects.toThrow(InvoiceStateError);
  });

  it("refuses to issue an empty draft", async () => {
    const draft = await createInvoice(payload({ lines: [] }));
    await expect(issueInvoice(draft.id)).rejects.toThrow(/at least one line/i);
  });

  // The safety net for drafts not holding stock. Without it the same stone sells twice.
  it("refuses to issue a second draft claiming a stone the first already sold", async () => {
    const first = await createInvoice(payload());
    const second = await createInvoice(payload());
    await issueInvoice(first.id);

    await expect(issueInvoice(second.id)).rejects.toThrow(/cannot issue/i);
    const stale = await getInvoice(second.id);
    expect(stale?.status).toBe("Draft");
  });

  it("names the offending stone and its current state", async () => {
    const first = await createInvoice(payload());
    const second = await createInvoice(payload());
    await issueInvoice(first.id);
    await expect(issueInvoice(second.id)).rejects.toThrow(/D-1042 is sold/i);
  });

  it("writes only one SALE movement when a double-issue is attempted", async () => {
    const before = getItem(STONE)?.ledger.length ?? 0;
    const first = await createInvoice(payload());
    const second = await createInvoice(payload());
    await issueInvoice(first.id);
    await expect(issueInvoice(second.id)).rejects.toThrow();
    expect(getItem(STONE)?.ledger.length).toBe(before + 1);
  });

  it("refuses to issue a draft whose item has gone out on memo since", async () => {
    const draft = await createInvoice(payload({ lines: [{ itemId: "J-2058", description: "On memo already", quantity: 1, unitPrice: 100 }] }));
    // J-2058 is seeded "On memo out" — in a customer's hands, so not ours to sell off this invoice.
    await expect(issueInvoice(draft.id)).rejects.toThrow(/on memo out/i);
  });

  it("still issues a free-text-only draft, which has no stock to check", async () => {
    const draft = await createInvoice(payload({ lines: [{ description: "Valuation", quantity: 1, unitPrice: 200 }] }));
    const issued = await issueInvoice(draft.id);
    expect(issued?.status).toBe("Open");
  });
});

describe("deleteDraftInvoice", () => {
  it("removes a draft entirely", async () => {
    const draft = await createInvoice(payload());
    await deleteDraftInvoice(draft.id);
    expect(await getInvoice(draft.id)).toBeUndefined();
  });

  it("leaves the stock untouched, since the draft never took it", async () => {
    const draft = await createInvoice(payload());
    await deleteDraftInvoice(draft.id);
    expect(getItem(STONE)?.status).toBe("Available");
  });

  it("refuses to delete an issued invoice — that is what Void is for", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    await expect(deleteDraftInvoice(invoice.id)).rejects.toThrow(/void/i);
    expect(await getInvoice(invoice.id)).toBeDefined();
  });

  it("is a no-op for an id that does not exist", async () => {
    await expect(deleteDraftInvoice("INV-nope")).resolves.toBeUndefined();
  });
});

describe("recordInvoiceSend", () => {
  it("stamps sentAt and appends to history", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    const sent = await recordInvoiceSend(invoice.id, { to: "a@b.example", subject: "Invoice", via: "mailto" });
    expect(sent.sentAt).toBeTruthy();
    expect(sent.sends).toHaveLength(1);
    expect(sent.sends[0].to).toBe("a@b.example");
  });

  it("keeps every resend rather than overwriting", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    await recordInvoiceSend(invoice.id, { to: "first@b.example", subject: "s", via: "mailto" });
    const twice = await recordInvoiceSend(invoice.id, { to: "second@b.example", subject: "s", via: "mailto" });
    expect(twice.sends.map((s) => s.to)).toEqual(["first@b.example", "second@b.example"]);
  });

  it("refuses to send a draft", async () => {
    const draft = await createInvoice(payload());
    await expect(recordInvoiceSend(draft.id, { to: "a@b.example", subject: "s", via: "mailto" })).rejects.toThrow(/issue this invoice/i);
  });

  it("refuses to send a void invoice", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    await voidInvoice(invoice.id);
    await expect(recordInvoiceSend(invoice.id, { to: "a@b.example", subject: "s", via: "mailto" })).rejects.toThrow(/void/i);
  });

  it("survives the status moving on — sent is a flag, not a state", async () => {
    const invoice = await createInvoice(payload(), { issue: true });
    await recordInvoiceSend(invoice.id, { to: "a@b.example", subject: "s", via: "mailto" });
    await voidInvoice(invoice.id);
    const after = await getInvoice(invoice.id);
    expect(after?.status).toBe("Void");
    expect(after?.sentAt).toBeTruthy();
    expect(after?.sends).toHaveLength(1);
  });
});

describe("numbering", () => {
  it("gives each invoice its own id", async () => {
    const a = await createInvoice(payload({ lines: [{ description: "a", quantity: 1, unitPrice: 1 }] }));
    const b = await createInvoice(payload({ lines: [{ description: "b", quantity: 1, unitPrice: 1 }] }));
    expect(a.id).not.toBe(b.id);
  });

  it("reuses a deleted draft's number rather than leaving a gap", async () => {
    const first = await createInvoice(payload({ lines: [{ description: "a", quantity: 1, unitPrice: 1 }] }));
    const second = await createInvoice(payload({ lines: [{ description: "b", quantity: 1, unitPrice: 1 }] }));
    await deleteDraftInvoice(second.id);
    const third = await createInvoice(payload({ lines: [{ description: "c", quantity: 1, unitPrice: 1 }] }));
    // Deliberate: a deleted draft was never issued, never sent and never seen by a customer, so its
    // number was never a document number. Reusing it keeps the issued sequence gap-free, which is what
    // an auditor actually cares about. Numbers only become permanent at issue.
    expect(third.id).toBe(second.id);
    expect(third.id).not.toBe(first.id);
  });

  it("never reuses an issued invoice's number", async () => {
    const issued = await createInvoice(payload(), { issue: true });
    const next = await createInvoice(payload({ lines: [{ description: "later", quantity: 1, unitPrice: 1 }] }));
    expect(next.id).not.toBe(issued.id);
  });

  it("puts new invoices in the list alongside the seeded ones", async () => {
    const before = (await listInvoices()).length;
    await createInvoice(payload());
    expect((await listInvoices()).length).toBe(before + 1);
  });
});
