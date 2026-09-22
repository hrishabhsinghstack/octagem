import type { MemoRecord, MemoRisk } from "@/types/memo";

/** §13.6 — risk is derived from the due date at read time, never stored. */
export function deriveMemoRisk(memo: Pick<MemoRecord, "dueDate" | "status">): MemoRisk {
  if (memo.status !== "Open") return "Healthy";
  const days = Math.ceil((new Date(`${memo.dueDate}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days <= 7) return "Due soon";
  return "Healthy";
}

/** Exposure is the sum of line totals — never a separately-maintained field that can drift. */
export function memoExposure(memo: Pick<MemoRecord, "lines">): number {
  return memo.lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

export function daysFromToday(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}
