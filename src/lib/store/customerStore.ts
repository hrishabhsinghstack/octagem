import { mockCustomers } from "@/data/mockCustomers";
import type { Customer } from "@/types/party";

const STORAGE_KEY = "octagem.customers.local";

function readAll(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Customer[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockCustomers));
  return mockCustomers;
}

function writeAll(customers: Customer[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
}

export function getAll(): Customer[] {
  return readAll();
}

export function getById(id: string): Customer | undefined {
  return readAll().find((c) => c.id === id);
}

export function insert(customer: Customer): Customer {
  const customers = readAll();
  customers.unshift(customer);
  writeAll(customers);
  return customer;
}

export function update(id: string, patch: Partial<Customer>): Customer | undefined {
  const customers = readAll();
  const index = customers.findIndex((c) => c.id === id);
  if (index === -1) return undefined;
  customers[index] = { ...customers[index], ...patch };
  writeAll(customers);
  return customers[index];
}

export function remove(id: string) {
  writeAll(readAll().filter((c) => c.id !== id));
}

export function nextCustomerId(): string {
  const numbers = readAll().map((c) => Number(c.id.replace("C-", ""))).filter((n) => !Number.isNaN(n));
  return `C-${(numbers.length ? Math.max(...numbers) : 2000) + 1}`;
}
