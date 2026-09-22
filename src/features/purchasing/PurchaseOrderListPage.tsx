import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreatePurchaseOrderDialog } from "@/features/purchasing/CreatePurchaseOrderDialog";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { listVendors } from "@/lib/api/vendorApi";
import { formatDateShort } from "@/lib/utils";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/types/purchaseOrder";
import type { Vendor } from "@/types/party";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const STATUS_VARIANT: Record<PurchaseOrderStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Draft: "outline",
  Sent: "secondary",
  "Partially received": "warning",
  Received: "success",
  Cancelled: "destructive",
};

export function PurchaseOrderListPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listPurchaseOrders().then(setOrders);
    listVendors().then((list) => setVendors(Object.fromEntries(list.map((v) => [v.id, v]))));
  };

  useEffect(refresh, []);

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Vendor orders and receiving — procurement only, no vendor bills yet.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New purchase order
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/purchase-orders/${order.id}`)}>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell>{vendors[order.vendorId]?.name ?? order.vendorId}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {order.lines.reduce((s, l) => s + l.receivedQty, 0)} / {order.lines.reduce((s, l) => s + l.expectedQty, 0)} received
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateShort(order.expectedDate)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {orders.length === 0 && <div className="py-16 text-center text-muted-foreground">No purchase orders yet.</div>}
      </Card>

      <CreatePurchaseOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
    <Outlet />
    </>
  );
}
