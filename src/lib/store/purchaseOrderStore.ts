import { mockPurchaseOrders } from "@/data/mockPurchaseOrders";
import { notifyDataChanged } from "@/lib/store/changes";
import type { PurchaseOrder } from "@/types/purchaseOrder";

const STORAGE_KEY = "octagem.purchaseOrders.local";

function migrate(orders: PurchaseOrder[]): { orders: PurchaseOrder[]; changed: boolean } {
  let changed = false;
  const migrated = orders.map((order) => {
    if (order.currency) return order;
    changed = true;
    return { ...order, currency: "USD", fxRateToBase: 1 };
  });
  return { orders: migrated, changed };
}

function readAll(): PurchaseOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { orders, changed } = migrate(JSON.parse(raw) as PurchaseOrder[]);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      return orders;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockPurchaseOrders));
  return mockPurchaseOrders;
}

function writeAll(orders: PurchaseOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  notifyDataChanged();
}

export function getAll(): PurchaseOrder[] {
  return readAll();
}

export function getById(id: string): PurchaseOrder | undefined {
  return readAll().find((o) => o.id === id);
}

export function insert(order: PurchaseOrder): PurchaseOrder {
  const orders = readAll();
  orders.unshift(order);
  writeAll(orders);
  return order;
}

export function update(id: string, patch: Partial<PurchaseOrder>): PurchaseOrder | undefined {
  const orders = readAll();
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) return undefined;
  orders[index] = { ...orders[index], ...patch };
  writeAll(orders);
  return orders[index];
}

export function remove(id: string) {
  writeAll(readAll().filter((o) => o.id !== id));
}

export function nextPurchaseOrderId(): string {
  const numbers = readAll().map((o) => Number(o.id.replace("PO-", ""))).filter((n) => !Number.isNaN(n));
  return `PO-${(numbers.length ? Math.max(...numbers) : 3000) + 1}`;
}
