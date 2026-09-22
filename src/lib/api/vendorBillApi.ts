import { getCurrentFxRate } from "@/lib/currency";
import { getById as getVendor } from "@/lib/store/vendorStore";
import * as store from "@/lib/store/vendorBillStore";
import * as paymentStore from "@/lib/store/vendorPaymentStore";
import type { InventoryItem } from "@/types/inventory";
import type { PaymentMethod } from "@/types/payment";
import type { VendorBill, VendorBillLine } from "@/types/vendorBill";
import type { VendorPayment } from "@/types/vendorPayment";

export async function listVendorBills(): Promise<VendorBill[]> {
  return [...store.getAll()];
}

export async function getVendorBill(id: string): Promise<VendorBill | undefined> {
  return store.getById(id);
}

export interface ConsignedSaleLine {
  item: InventoryItem;
  /** What the vendor is owed for this item — the item's own consignmentValue, not necessarily what the customer paid. */
  amount: number;
}

/**
 * §13.5 — the moment a consigned item sells, the business owes the vendor a bill. Called from
 * invoiceApi.ts's markItemsSold whenever any sold item has ownership CONSIGNED_IN. Groups by vendor
 * so one sale event touching two vendors' consigned items creates two bills, not a mixed one.
 */
export async function createVendorBillsForConsignedSales(lines: ConsignedSaleLine[], sourceInvoiceId: string): Promise<VendorBill[]> {
  if (lines.length === 0) return [];

  const byVendor = new Map<string, ConsignedSaleLine[]>();
  lines.forEach((line) => {
    const vendorId = line.item.vendorId;
    if (!vendorId) return;
    const existing = byVendor.get(vendorId) ?? [];
    existing.push(line);
    byVendor.set(vendorId, existing);
  });

  const today = new Date().toISOString().slice(0, 10);
  const bills: VendorBill[] = [];

  byVendor.forEach((vendorLines, vendorId) => {
    const vendor = getVendor(vendorId);
    const currency = vendor?.currency ?? "USD";
    const billLines: VendorBillLine[] = vendorLines.map((l, index) => ({
      id: `${l.item.id}-VBL${index + 1}`,
      itemId: l.item.id,
      description: `${l.item.code} · ${l.item.title}`,
      unitPrice: l.amount,
      quantity: 1,
      lineTotal: l.amount,
    }));
    const subtotal = billLines.reduce((sum, l) => sum + l.lineTotal, 0);
    const id = store.nextVendorBillId();
    const bill: VendorBill = {
      id,
      vendorId,
      lines: billLines,
      subtotal,
      total: subtotal,
      status: "Open",
      sourceType: "MemoInConversion",
      sourceId: sourceInvoiceId,
      issuedAt: today,
      dueDate: today,
      currency,
      fxRateToBase: getCurrentFxRate(currency),
      paidAmount: 0,
    };
    store.insert(bill);
    bills.push(bill);
  });

  return bills;
}

export interface RecordVendorPaymentPayload {
  vendorBillId: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
}

export async function recordVendorPayment(payload: RecordVendorPaymentPayload): Promise<VendorPayment | undefined> {
  const bill = store.getById(payload.vendorBillId);
  if (!bill) return undefined;

  const payment: VendorPayment = {
    id: paymentStore.nextVendorPaymentId(),
    vendorBillId: payload.vendorBillId,
    vendorId: bill.vendorId,
    method: payload.method,
    amount: payload.amount,
    reference: payload.reference,
    paidAt: new Date().toISOString().slice(0, 10),
  };
  paymentStore.insert(payment);

  const paidAmount = Math.min(bill.total, bill.paidAmount + payload.amount);
  store.update(bill.id, { paidAmount, status: paidAmount >= bill.total ? "Paid" : "Partially paid" });

  return payment;
}

export async function listVendorPaymentsForBill(vendorBillId: string): Promise<VendorPayment[]> {
  return paymentStore.listByVendorBill(vendorBillId);
}

export async function voidVendorBill(id: string): Promise<VendorBill | undefined> {
  return store.update(id, { status: "Void" });
}
