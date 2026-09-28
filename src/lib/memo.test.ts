import { deriveMemoRisk, memoExposure, openMemoLines } from "@/lib/memo";
import type { MemoLine } from "@/types/memo";
import { describe, expect, it } from "vitest";

function line(id: string, lineTotal: number, settledAs?: MemoLine["settledAs"]): MemoLine {
  return { id, itemId: `I-${id}`, priceBasis: "10% off Rap", quantity: 1, lineTotal, settledAs };
}

describe("memoExposure", () => {
  it("sums the line totals of an untouched memo", () => {
    expect(memoExposure({ lines: [line("L1", 5_000), line("L2", 3_000)] })).toBe(8_000);
  });

  it("excludes lines the customer bought, so a partial conversion drops exposure", () => {
    expect(memoExposure({ lines: [line("L1", 5_000, "Invoiced"), line("L2", 3_000)] })).toBe(3_000);
  });

  it("excludes lines sent back", () => {
    expect(memoExposure({ lines: [line("L1", 5_000, "Returned"), line("L2", 3_000)] })).toBe(3_000);
  });

  it("is zero once every line is settled — nothing is in anyone else's hands", () => {
    expect(memoExposure({ lines: [line("L1", 5_000, "Invoiced"), line("L2", 3_000, "Returned")] })).toBe(0);
  });

  it("is zero for a memo with no lines", () => {
    expect(memoExposure({ lines: [] })).toBe(0);
  });
});

describe("openMemoLines", () => {
  it("keeps only what is still out", () => {
    const lines = [line("L1", 1_000, "Invoiced"), line("L2", 2_000), line("L3", 3_000, "Returned"), line("L4", 4_000)];
    expect(openMemoLines(lines).map((l) => l.id)).toEqual(["L2", "L4"]);
  });

  it("returns everything when nothing has settled", () => {
    const lines = [line("L1", 1_000), line("L2", 2_000)];
    expect(openMemoLines(lines)).toHaveLength(2);
  });
});

describe("deriveMemoRisk", () => {
  const isoDaysFromNow = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  it("flags a past due date as overdue", () => {
    expect(deriveMemoRisk({ dueDate: isoDaysFromNow(-1), status: "Open" })).toBe("Overdue");
  });

  it("warns inside the seven-day window", () => {
    expect(deriveMemoRisk({ dueDate: isoDaysFromNow(3), status: "Open" })).toBe("Due soon");
  });

  it("is healthy well ahead of the due date", () => {
    expect(deriveMemoRisk({ dueDate: isoDaysFromNow(30), status: "Open" })).toBe("Healthy");
  });

  it("never reports risk on a closed memo, however overdue it looks", () => {
    expect(deriveMemoRisk({ dueDate: isoDaysFromNow(-90), status: "Converted" })).toBe("Healthy");
    expect(deriveMemoRisk({ dueDate: isoDaysFromNow(-90), status: "Returned" })).toBe("Healthy");
  });
});
