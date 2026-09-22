import { mockMemos } from "@/data/mockMemos";
import { getAll as getAllCustomers } from "@/lib/store/customerStore";
import type { MemoRecord } from "@/types/memo";

const STORAGE_KEY = "octagem.memos.local";

/**
 * Backfills/drops records from shapes this store held before `lines` (replacing itemIds/
 * exposureValue) and `customerId` existed. A record predating `lines` can't be reconstructed
 * honestly, so it's dropped rather than left to crash readers; `customerId` is backfilled by
 * matching the denormalized `counterparty` name against the current customer list.
 */
function migrate(raw: unknown[]): { memos: MemoRecord[]; changed: boolean } {
  let changed = false;
  const customers = getAllCustomers();
  const memos: MemoRecord[] = [];

  for (const entry of raw) {
    const memo = entry as Partial<MemoRecord> & { counterparty?: string };
    if (!Array.isArray(memo.lines)) {
      changed = true;
      continue;
    }
    if (!memo.customerId) {
      changed = true;
      const match = customers.find((c) => c.name === memo.counterparty);
      memo.customerId = match?.id ?? "";
    }
    memos.push(memo as MemoRecord);
  }

  return { memos, changed };
}

function readAll(): MemoRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { memos, changed } = migrate(JSON.parse(raw) as unknown[]);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
      return memos;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockMemos));
  return mockMemos;
}

function writeAll(memos: MemoRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
}

export function getAll(): MemoRecord[] {
  return readAll();
}

export function getById(id: string): MemoRecord | undefined {
  return readAll().find((memo) => memo.id === id);
}

export function insert(memo: MemoRecord): MemoRecord {
  const memos = readAll();
  memos.unshift(memo);
  writeAll(memos);
  return memo;
}

export function update(id: string, patch: Partial<MemoRecord>): MemoRecord | undefined {
  const memos = readAll();
  const index = memos.findIndex((memo) => memo.id === id);
  if (index === -1) return undefined;
  const updated = { ...memos[index], ...patch };
  memos[index] = updated;
  writeAll(memos);
  return updated;
}

export function nextMemoId(): string {
  const memos = readAll();
  const numbers = memos.map((memo) => Number(memo.id.replace("M-", ""))).filter((n) => !Number.isNaN(n));
  return `M-${(numbers.length ? Math.max(...numbers) : 1000) + 1}`;
}
