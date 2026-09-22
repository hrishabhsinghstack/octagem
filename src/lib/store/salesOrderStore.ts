import { mockSalesOrders } from "@/data/mockSalesOrders";
import type { SalesOrder } from "@/types/salesOrder";

const STORAGE_KEY = "octagem.salesOrders.local";

function migrate(orders: SalesOrder[]): { orders: SalesOrder[]; changed: boolean } {
  let changed = false;
  const migrated = orders.map((order) => {
    if (order.currency) return order;
    changed = true;
    return { ...order, currency: "USD", fxRateToBase: 1 };
  });
  return { orders: migrated, changed };
}

function readAll(): SalesOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { orders, changed } = migrate(JSON.parse(raw) as SalesOrder[]);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      return orders;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockSalesOrders));
  return mockSalesOrders;
}

function writeAll(orders: SalesOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function getAll(): SalesOrder[] {
  return readAll();
}

export function getById(id: string): SalesOrder | undefined {
  return readAll().find((o) => o.id === id);
}

export function insert(order: SalesOrder): SalesOrder {
  const orders = readAll();
  orders.unshift(order);
  writeAll(orders);
  return order;
}

export function update(id: string, patch: Partial<SalesOrder>): SalesOrder | undefined {
  const orders = readAll();
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) return undefined;
  orders[index] = { ...orders[index], ...patch };
  writeAll(orders);
  return orders[index];
}

export function nextSalesOrderId(): string {
  const numbers = readAll().map((o) => Number(o.id.replace("SO-", ""))).filter((n) => !Number.isNaN(n));
  return `SO-${(numbers.length ? Math.max(...numbers) : 5000) + 1}`;
}
