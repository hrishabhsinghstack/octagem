import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getVendor } from "@/lib/api/vendorApi";
import { listInventory } from "@/lib/api/inventoryApi";
import { listMemoIns } from "@/lib/api/memoInApi";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { listVendorBills } from "@/lib/api/vendorBillApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { InventoryItem, ItemStatus } from "@/types/inventory";
import type { MemoInRecord, MemoInStatus } from "@/types/memoIn";
import type { Vendor } from "@/types/party";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/types/purchaseOrder";
import type { VendorBill, VendorBillStatus } from "@/types/vendorBill";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const PO_STATUS_VARIANT: Record<PurchaseOrderStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Draft: "outline",
  Sent: "secondary",
  "Partially received": "warning",
  Received: "success",
  Cancelled: "destructive",
};

const MEMO_IN_STATUS_VARIANT: Record<MemoInStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "outline",
  "Partially received": "warning",
  Received: "success",
};

const VENDOR_BILL_STATUS_VARIANT: Record<VendorBillStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

const ITEM_STATUS_VARIANT: Record<ItemStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Available: "success",
  "On memo out": "warning",
  Reserved: "secondary",
  "Verification hold": "outline",
  Sold: "outline",
  "Returned to vendor": "destructive",
};

export function VendorDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [memoIns, setMemoIns] = useState<MemoInRecord[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [consignedItems, setConsignedItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getVendor(id).then((found) => {
      setVendor(found ?? null);
      if (found) recordRecentActivity({ type: "vendor", id: found.id, label: found.name, path: `/vendors/${found.id}` });
    });
    listPurchaseOrders().then((all) => setPurchaseOrders(all.filter((o) => o.vendorId === id)));
    listMemoIns().then((all) => setMemoIns(all.filter((m) => m.vendorId === id)));
    listVendorBills().then((all) => setBills(all.filter((b) => b.vendorId === id)));
    listInventory().then((all) => setConsignedItems(all.filter((item) => item.vendorId === id && item.ownership === "CONSIGNED_IN")));
  }, [id]);

  const close = () => navigate("/vendors");

  if (!vendor) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Vendor not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const poValue = purchaseOrders
    .filter((o) => o.status !== "Cancelled")
    .reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.expectedCost * l.expectedQty, 0), 0);
  const openPayable = bills.filter((b) => b.status !== "Void").reduce((sum, b) => sum + (b.total - b.paidAmount), 0);
  const openMemoIns = memoIns.filter((m) => m.status !== "Received").length;
  const heldInStock = consignedItems.filter((item) => item.status !== "Sold" && item.status !== "Returned to vendor").length;

  return (
    <Sheet open onOpenChange={(next) => !next && close()}>
      <SheetContent size="formLg" className="p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Vendor · {vendor.id}</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{vendor.name}</h1>
            <p className="text-muted-foreground mt-1">{vendor.currency} · {vendor.paymentTerms || "No terms set"}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Purchase order value</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(poValue, vendor.currency)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Open payable balance</p>
            <p className={`text-lg font-semibold mt-1 ${openPayable > 0 ? "text-destructive" : ""}`}>{formatCurrency(openPayable, vendor.currency)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Open memo-in shipments</p>
            <p className="text-lg font-semibold mt-1">{openMemoIns}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Consigned items in stock</p>
            <p className="text-lg font-semibold mt-1">{heldInStock}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact &amp; terms</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="font-medium">{vendor.contact || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Phone / Email</dt>
                <dd className="font-medium">{vendor.phone || vendor.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd className="font-medium">{vendor.address || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Payment terms</dt>
                <dd className="font-medium">{vendor.paymentTerms || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Currency</dt>
                <dd className="font-medium">{vendor.currency || "—"}</dd>
              </div>
            </dl>
            {vendor.notes && (
              <>
                <p className="text-xs text-muted-foreground mt-4 mb-1">Notes</p>
                <p className="text-sm">{vendor.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {purchaseOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((order) => (
                    <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/purchase-orders/${order.id}`)}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateShort(order.expectedDate)}</TableCell>
                      <TableCell>
                        <Badge variant={PO_STATUS_VARIANT[order.status]}>{order.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Memo In (consignment received)</CardTitle>
          </CardHeader>
          <CardContent>
            {memoIns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Memo In #</TableHead>
                    <TableHead>Due back</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memoIns.map((record) => (
                    <TableRow key={record.id} className="cursor-pointer" onClick={() => navigate(`/memos/in/${record.id}`)}>
                      <TableCell className="font-medium">{record.id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateShort(record.dueDate)}</TableCell>
                      <TableCell>
                        <Badge variant={MEMO_IN_STATUS_VARIANT[record.status]}>{record.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No Memo In records yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor Bills</CardTitle>
          </CardHeader>
          <CardContent>
            {bills.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id} className="cursor-pointer" onClick={() => navigate(`/vendor-bills/${bill.id}`)}>
                      <TableCell className="font-medium">{bill.id}</TableCell>
                      <TableCell className="text-right">{formatCurrency(bill.total, bill.currency)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(bill.total - bill.paidAmount, bill.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={VENDOR_BILL_STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No vendor bills yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consigned inventory currently held</CardTitle>
          </CardHeader>
          <CardContent>
            {consignedItems.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consignedItems.map((item) => (
                    <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/inventory/${item.id}`)}>
                      <TableCell>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.code}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.cost)}</TableCell>
                      <TableCell>
                        <Badge variant={ITEM_STATUS_VARIANT[item.status]}>{item.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No consigned items on hand.</p>
            )}
          </CardContent>
        </Card>
      </SheetContent>
    </Sheet>
  );
}
