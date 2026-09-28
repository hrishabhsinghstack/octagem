import { convertMemo, getMemo, issueMemo, returnMemo, type IssueMemoPayload } from "@/lib/api/memoApi";
import { getInvoice } from "@/lib/api/invoiceApi";
import { memoExposure } from "@/lib/memo";
import { getById as getItem } from "@/lib/store/inventoryStore";
import { installMemoryStorage } from "@/test/memoryStorage";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  installMemoryStorage();
});

/** Three seeded diamonds out on one memo — the shape a partial conversion actually happens on. */
const THREE_STONES = ["D-1042", "D-1077", "D-1103"];

async function issueThreeStoneMemo() {
  const payload: IssueMemoPayload = {
    customerId: "C-2001",
    counterparty: "Sterling & Co.",
    memoToAddress: "22 W 48th St, New York, NY 10036",
    shipToAddress: "22 W 48th St, New York, NY 10036",
    contact: "Marcus Webb",
    phone: "(212) 555-0142",
    salesperson: "Devesh Rao",
    dueDate: "2099-01-01",
    lines: THREE_STONES.map((itemId, index) => ({ itemId, priceBasis: "10% off Rap", quantity: 1, lineTotal: (index + 1) * 1_000 })),
  };
  return issueMemo(payload);
}

describe("convertMemo", () => {
  it("invoices only the selected lines and leaves the memo open with the rest", async () => {
    const memo = await issueThreeStoneMemo();
    const kept = memo.lines[0];

    await convertMemo(memo.id, [kept.id]);
    const after = await getMemo(memo.id);

    expect(after?.status).toBe("Open");
    expect(after?.lines.filter((l) => l.settledAs === "Invoiced")).toHaveLength(1);
    expect(after?.lines.filter((l) => !l.settledAs)).toHaveLength(2);
    // The memo-level invoiceId is reserved for the conversion that closes the memo out.
    expect(after?.invoiceId).toBeUndefined();
  });

  it("puts only the converted items on the invoice", async () => {
    const memo = await issueThreeStoneMemo();
    const kept = memo.lines[1];

    await convertMemo(memo.id, [kept.id]);
    const after = await getMemo(memo.id);
    const invoiceId = after?.lines.find((l) => l.id === kept.id)?.invoiceId;
    const invoice = invoiceId ? await getInvoice(invoiceId) : undefined;

    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0].itemId).toBe(kept.itemId);
    expect(invoice?.sourceType).toBe("MemoConversion");
  });

  it("drops exposure by the converted line only", async () => {
    const memo = await issueThreeStoneMemo();
    expect(memoExposure(memo)).toBe(6_000); // 1000 + 2000 + 3000

    await convertMemo(memo.id, [memo.lines[2].id]); // the 3,000 line
    const after = await getMemo(memo.id);

    expect(memoExposure(after!)).toBe(3_000);
  });

  it("marks only the converted item Sold, leaving the others on memo", async () => {
    const memo = await issueThreeStoneMemo();

    await convertMemo(memo.id, [memo.lines[0].id]);

    expect(getItem(THREE_STONES[0])?.status).toBe("Sold");
    expect(getItem(THREE_STONES[1])?.status).toBe("On memo out");
    expect(getItem(THREE_STONES[2])?.status).toBe("On memo out");
  });

  it("converts everything and closes the memo when no lines are named", async () => {
    const memo = await issueThreeStoneMemo();

    await convertMemo(memo.id);
    const after = await getMemo(memo.id);

    expect(after?.status).toBe("Converted");
    expect(after?.invoiceId).toBeDefined();
    expect(after?.lines.every((l) => l.settledAs === "Invoiced")).toBe(true);
    expect(memoExposure(after!)).toBe(0);
  });

  it("closes the memo once the final outstanding line converts", async () => {
    const memo = await issueThreeStoneMemo();

    await convertMemo(memo.id, [memo.lines[0].id]);
    expect((await getMemo(memo.id))?.status).toBe("Open");

    await convertMemo(memo.id, [memo.lines[1].id, memo.lines[2].id]);
    const after = await getMemo(memo.id);

    expect(after?.status).toBe("Converted");
    expect(after?.invoiceId).toBeDefined();
  });

  it("gives each partial conversion its own invoice", async () => {
    const memo = await issueThreeStoneMemo();

    await convertMemo(memo.id, [memo.lines[0].id]);
    await convertMemo(memo.id, [memo.lines[1].id]);
    const after = await getMemo(memo.id);

    const invoiceIds = after!.lines.filter((l) => l.invoiceId).map((l) => l.invoiceId);
    expect(new Set(invoiceIds).size).toBe(2);
  });

  it("ignores an already-settled line rather than invoicing it twice", async () => {
    const memo = await issueThreeStoneMemo();
    const target = memo.lines[0];

    await convertMemo(memo.id, [target.id]);
    const firstInvoiceId = (await getMemo(memo.id))!.lines.find((l) => l.id === target.id)?.invoiceId;
    await convertMemo(memo.id, [target.id]);
    const after = await getMemo(memo.id);

    expect(after!.lines.find((l) => l.id === target.id)?.invoiceId).toBe(firstInvoiceId);
    expect(after?.status).toBe("Open");
  });
});

describe("returnMemo", () => {
  it("returns only the selected lines and keeps the memo open", async () => {
    const memo = await issueThreeStoneMemo();

    await returnMemo(memo.id, [memo.lines[0].id]);
    const after = await getMemo(memo.id);

    expect(after?.status).toBe("Open");
    expect(after?.lines.filter((l) => l.settledAs === "Returned")).toHaveLength(1);
    expect(getItem(THREE_STONES[0])?.status).toBe("Available");
    expect(getItem(THREE_STONES[1])?.status).toBe("On memo out");
  });

  it("closes the memo once everything is back", async () => {
    const memo = await issueThreeStoneMemo();

    await returnMemo(memo.id);
    const after = await getMemo(memo.id);

    expect(after?.status).toBe("Returned");
    expect(memoExposure(after!)).toBe(0);
  });

  it("closes the memo when the remainder is returned after a partial conversion", async () => {
    const memo = await issueThreeStoneMemo();

    await convertMemo(memo.id, [memo.lines[0].id]);
    await returnMemo(memo.id);
    const after = await getMemo(memo.id);

    // Mixed outcome: one sold, two back on the shelf, nothing left in custody.
    expect(after?.status).toBe("Returned");
    expect(after?.lines.filter((l) => l.settledAs === "Invoiced")).toHaveLength(1);
    expect(after?.lines.filter((l) => l.settledAs === "Returned")).toHaveLength(2);
    expect(getItem(THREE_STONES[0])?.status).toBe("Sold");
    expect(getItem(THREE_STONES[1])?.status).toBe("Available");
  });
});
