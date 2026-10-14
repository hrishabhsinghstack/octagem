import { mockJobOrders } from "@/data/mockJobOrders";
import { notifyDataChanged } from "@/lib/store/changes";
import type { JobOrder } from "@/types/jobOrder";

const STORAGE_KEY = "octagem.jobOrders.local";

/** Backfills fields added after a job was first saved. */
function migrate(jobs: JobOrder[]): JobOrder[] {
  return jobs.map((job) => (job.customerMaterials ? job : { ...job, customerMaterials: [] }));
}

function readAll(): JobOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw) as JobOrder[]);
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockJobOrders));
  return mockJobOrders;
}

function writeAll(jobs: JobOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  notifyDataChanged();
}

export function getAll(): JobOrder[] {
  return readAll();
}

export function getById(id: string): JobOrder | undefined {
  return readAll().find((j) => j.id === id);
}

export function insert(job: JobOrder): JobOrder {
  const jobs = readAll();
  jobs.unshift(job);
  writeAll(jobs);
  return job;
}

export function update(id: string, patch: Partial<JobOrder>): JobOrder | undefined {
  const jobs = readAll();
  const index = jobs.findIndex((j) => j.id === id);
  if (index === -1) return undefined;
  jobs[index] = { ...jobs[index], ...patch };
  writeAll(jobs);
  return jobs[index];
}

export function remove(id: string) {
  writeAll(readAll().filter((j) => j.id !== id));
}

/** JO-0001, JO-0002… — four digits, so the numbers sort as text in exports. */
export function nextJobOrderId(): string {
  const numbers = readAll()
    .map((j) => Number(j.id.replace("JO-", "")))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `JO-${String(next).padStart(4, "0")}`;
}
