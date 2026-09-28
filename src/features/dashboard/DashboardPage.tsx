import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listCustomers } from "@/lib/api/customerApi";
import { listInventory } from "@/lib/api/inventoryApi";
import { listInvoices } from "@/lib/api/invoiceApi";
import { listMemos } from "@/lib/api/memoApi";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { listVendorBills } from "@/lib/api/vendorBillApi";
import { listVendors } from "@/lib/api/vendorApi";
import { memoExposure } from "@/lib/memo";
import { readRecentActivity, type RecentActivityEntry, type RecentActivityType } from "@/lib/recentActivity";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import type { Customer, Vendor } from "@/types/party";
import type { InventoryItem } from "@/types/inventory";
import type { Invoice } from "@/types/invoice";
import type { MemoRecord } from "@/types/memo";
import type { PurchaseOrder } from "@/types/purchaseOrder";
import type { VendorBill } from "@/types/vendorBill";
import {
  AlertTriangle,
  Building2,
  Clock,
  Handshake,
  History,
  Landmark,
  Package,
  PackagePlus,
  Receipt,
  ShoppingCart,
  TrendingDown,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const TYPE_ICON: Record<RecentActivityType, LucideIcon> = {
  inventory: Package,
  invoice: Receipt,
  purchaseOrder: ShoppingCart,
  vendorBill: Landmark,
  memo: Handshake,
  memoIn: PackagePlus,
  customer: User,
  vendor: Building2,
};

const AGING_THRESHOLD_DAYS = 90;
const ATTENTION_WINDOW_DAYS = 3;
const MEMO_ATTENTION_WINDOW_DAYS = 7;
const MAX_ATTENTION_ENTRIES = 8;
const MAX_RECENT_ENTRIES = 8;

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(`${dateStr}T00:00:00`).getTime()) / 86_400_000);
}

function urgencyBadge(days: number): { variant: "destructive" | "warning"; text: string } {
  if (days > 0) return { variant: "destructive", text: `${days}d overdue` };
  if (days === 0) return { variant: "warning", text: "Due today" };
  return { variant: "warning", text: `Due in ${-days}d` };
}

interface AttentionEntry {
  key: string;
  type: RecentActivityType;
  title: string;
  subtitle: string;
  amount?: number;
  currency?: string;
  days: number;
  path: string;
}

export function DashboardPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [memos, setMemos] = useState<MemoRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [recentActivity, setRecentActivity] = useState<RecentActivityEntry[]>([]);

  useEffect(() => {
    listInventory().then(setItems);
    listMemos().then(setMemos);
    listPurchaseOrders().then(setPurchaseOrders);
    listInvoices().then(setInvoices);
    listVendorBills().then(setVendorBills);
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
    listVendors().then((list) => setVendors(Object.fromEntries(list.map((v) => [v.id, v]))));
    setRecentActivity(readRecentActivity());
  }, []);

  const availableItems = items.filter((i) => i.status === "Available");
  const availableValue = availableItems.reduce((sum, i) => sum + i.askingPrice, 0);
  const openMemos = memos.filter((m) => m.status === "Open");
  const totalMemoExposure = openMemos.reduce((sum, m) => sum + memoExposure(m), 0);
  const byCategory = {
    Diamond: items.filter((i) => i.category === "Diamond").length,
    Jewelry: items.filter((i) => i.category === "Jewelry").length,
    Watch: items.filter((i) => i.category === "Watch").length,
  };

  const openPurchaseOrders = purchaseOrders.filter((o) => o.status !== "Received" && o.status !== "Cancelled");
  const openInvoices = invoices.filter((i) => i.status !== "Paid" && i.status !== "Void");
  const openReceivables = openInvoices.reduce((sum, i) => sum + (i.total - i.paidAmount), 0);
  const openVendorBills = vendorBills.filter((b) => b.status !== "Paid" && b.status !== "Void");
  const openPayables = openVendorBills.reduce((sum, b) => sum + (b.total - b.paidAmount), 0);

  const agingItems = availableItems.filter((i) => daysSince(i.receivedAt) >= AGING_THRESHOLD_DAYS);
  const agingValue = agingItems.reduce((sum, i) => sum + i.cost, 0);

  const attention: AttentionEntry[] = [];

  openMemos.forEach((memo) => {
    const days = daysSince(memo.dueDate);
    if (days > -MEMO_ATTENTION_WINDOW_DAYS) {
      attention.push({ key: `memo-${memo.id}`, type: "memo", title: memo.id, subtitle: `Memo Out · ${memo.counterparty}`, amount: memoExposure(memo), days, path: `/memos/${memo.id}` });
    }
  });

  purchaseOrders
    .filter((o) => o.status !== "Received" && o.status !== "Cancelled")
    .forEach((order) => {
      const days = daysSince(order.expectedDate);
      if (days > -ATTENTION_WINDOW_DAYS) {
        const value = order.lines.reduce((s, l) => s + l.expectedCost * l.expectedQty, 0);
        attention.push({
          key: `po-${order.id}`,
          type: "purchaseOrder",
          title: order.id,
          subtitle: `Purchase Order · ${vendors[order.vendorId]?.name ?? order.vendorId}`,
          amount: value,
          currency: order.currency,
          days,
          path: `/purchase-orders/${order.id}`,
        });
      }
    });

  openInvoices.forEach((invoice) => {
    const days = daysSince(invoice.dueDate);
    if (days > -ATTENTION_WINDOW_DAYS) {
      attention.push({
        key: `inv-${invoice.id}`,
        type: "invoice",
        title: invoice.id,
        subtitle: `Invoice (AR) · ${customers[invoice.customerId]?.name ?? invoice.customerId}`,
        amount: invoice.total - invoice.paidAmount,
        currency: invoice.currency,
        days,
        path: `/invoices/${invoice.id}`,
      });
    }
  });

  openVendorBills.forEach((bill) => {
    const days = daysSince(bill.dueDate);
    if (days > -ATTENTION_WINDOW_DAYS) {
      attention.push({
        key: `vb-${bill.id}`,
        type: "vendorBill",
        title: bill.id,
        subtitle: `Vendor Bill (AP) · ${vendors[bill.vendorId]?.name ?? bill.vendorId}`,
        amount: bill.total - bill.paidAmount,
        currency: bill.currency,
        days,
        path: `/vendor-bills/${bill.id}`,
      });
    }
  });

  attention.sort((a, b) => b.days - a.days);
  const topAttention = attention.slice(0, MAX_ATTENTION_ENTRIES);
  const recent = recentActivity.slice(0, MAX_RECENT_ENTRIES);

  return (
    <div className="p-8 space-y-8 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Live inventory value, custody exposure, and what needs action today.</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Available inventory</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(availableValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{availableItems.length} items ready to sell</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Memo exposure</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalMemoExposure)}</p>
          <p className="text-xs text-muted-foreground mt-1">{openMemos.length} active custody transfers</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Open receivables (AR)</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(openReceivables)}</p>
          <p className="text-xs text-muted-foreground mt-1">{openInvoices.length} invoices awaiting payment</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Open payables (AP)</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(openPayables)}</p>
          <p className="text-xs text-muted-foreground mt-1">{openVendorBills.length} vendor bills to pay</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingDown className="h-3 w-3" /> Aging inventory (90d+)
          </div>
          <p className={`text-2xl font-semibold mt-1 ${agingItems.length > 0 ? "text-amber-600" : ""}`}>{formatCurrency(agingValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{agingItems.length} items unsold 90+ days</p>
        </Card>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Link to="/inventory">
          <Card className="p-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              <p className="text-xs">Inventory</p>
            </div>
            <p className="text-2xl font-semibold mt-1">{items.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{byCategory.Diamond} diamond · {byCategory.Jewelry} jewelry · {byCategory.Watch} watch</p>
          </Card>
        </Link>
        <Link to="/memos">
          <Card className="p-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Handshake className="h-3.5 w-3.5" />
              <p className="text-xs">Open memos</p>
            </div>
            <p className="text-2xl font-semibold mt-1">{openMemos.length}</p>
          </Card>
        </Link>
        <Link to="/purchase-orders">
          <Card className="p-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" />
              <p className="text-xs">Open purchase orders</p>
            </div>
            <p className="text-2xl font-semibold mt-1">{openPurchaseOrders.length}</p>
          </Card>
        </Link>
        <Link to="/invoices">
          <Card className="p-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" />
              <p className="text-xs">Open invoices</p>
            </div>
            <p className="text-2xl font-semibold mt-1">{openInvoices.length}</p>
          </Card>
        </Link>
        <Link to="/vendor-bills">
          <Card className="p-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Landmark className="h-3.5 w-3.5" />
              <p className="text-xs">Open vendor bills</p>
            </div>
            <p className="text-2xl font-semibold mt-1">{openVendorBills.length}</p>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-medium">Needs attention</h2>
            </div>
            <p className="text-xs text-muted-foreground">Overdue or due within {ATTENTION_WINDOW_DAYS} days, across every module</p>
          </div>
          <div className="space-y-2">
            {topAttention.map((entry) => {
              const Icon = TYPE_ICON[entry.type];
              const badge = urgencyBadge(entry.days);
              return (
                <Link key={entry.key} to={entry.path} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{entry.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {entry.amount !== undefined && <span className="text-sm font-medium">{formatCurrency(entry.amount, entry.currency)}</span>}
                    <Badge variant={badge.variant}>{badge.text}</Badge>
                  </div>
                </Link>
              );
            })}
            {topAttention.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nothing overdue or due soon — you're caught up.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Recently viewed</h2>
          </div>
          <div className="space-y-1">
            {recent.map((entry) => {
              const Icon = TYPE_ICON[entry.type];
              return (
                <Link key={`${entry.type}-${entry.id}`} to={entry.path} className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{entry.label}</p>
                      {entry.sublabel && <p className="text-xs text-muted-foreground truncate">{entry.sublabel}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatRelativeTime(entry.at)}
                  </span>
                </Link>
              );
            })}
            {recent.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Records you open will show up here, so you never lose track of what you were working on.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
