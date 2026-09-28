import type { ImportBatch } from "@/types/importBatch";

/** localStorage-backed import history, newest first. Swap for API calls when the backend exists. */
const STORAGE_KEY = "octagem.importBatches.local";

function readAll(): ImportBatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImportBatch[]) : [];
  } catch {
    return [];
  }
}

function writeAll(batches: ImportBatch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
}

export function getAll(): ImportBatch[] {
  return readAll();
}

export function getById(id: string): ImportBatch | undefined {
  return readAll().find((batch) => batch.id === id);
}

export function insert(batch: ImportBatch): ImportBatch {
  writeAll([batch, ...readAll()]);
  return batch;
}

export function update(id: string, patch: Partial<ImportBatch>): ImportBatch | undefined {
  const batches = readAll();
  const index = batches.findIndex((batch) => batch.id === id);
  if (index === -1) return undefined;
  batches[index] = { ...batches[index], ...patch };
  writeAll(batches);
  return batches[index];
}

export function nextBatchId(): string {
  const numbers = readAll()
    .map((batch) => Number(batch.id.replace("IMP-", "")))
    .filter((n) => !Number.isNaN(n));
  return `IMP-${(numbers.length ? Math.max(...numbers) : 1000) + 1}`;
}
