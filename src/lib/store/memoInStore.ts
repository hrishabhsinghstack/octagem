import { mockMemoIn } from "@/data/mockMemoIn";
import type { MemoInRecord } from "@/types/memoIn";

const STORAGE_KEY = "octagem.memoIn.local";

function readAll(): MemoInRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MemoInRecord[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockMemoIn));
  return mockMemoIn;
}

function writeAll(records: MemoInRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getAll(): MemoInRecord[] {
  return readAll();
}

export function getById(id: string): MemoInRecord | undefined {
  return readAll().find((r) => r.id === id);
}

export function insert(record: MemoInRecord): MemoInRecord {
  const records = readAll();
  records.unshift(record);
  writeAll(records);
  return record;
}

export function update(id: string, patch: Partial<MemoInRecord>): MemoInRecord | undefined {
  const records = readAll();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return undefined;
  records[index] = { ...records[index], ...patch };
  writeAll(records);
  return records[index];
}

export function nextMemoInId(): string {
  const numbers = readAll().map((r) => Number(r.id.replace("MI-", ""))).filter((n) => !Number.isNaN(n));
  return `MI-${(numbers.length ? Math.max(...numbers) : 7000) + 1}`;
}
