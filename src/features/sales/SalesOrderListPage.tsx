import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateSalesOrderDialog } from "@/features/sales/CreateSalesOrderDialog";
import { listCustomers } from "@/lib/api/customerApi";
import { getWorkflowSettings } from "@/lib/api/settingsApi";
import { listSalesOrders } from "@/lib/api/salesOrderApi";
import { formatCurrency } from "@/lib/utils";
import type { SalesOrder, SalesOrderStatus } from "@/types/salesOrder";
import type { Customer } from "@/types/party";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";

const STATUS_VARIANT: Record<SalesOrderStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Draft: "outline",
  Allocated: "secondary",
  "Partially fulfilled": "warning",
  Fulfilled: "success",
  Invoiced: "success",
  Cancelled: "destructive",
};

export function SalesOrderListPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [requireQuote, setRequireQuote] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listSalesOrders().then(setOrders);
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
    getWorkflowSettings().then((s) => setRequireQuote(s.requireQuoteBeforeSalesOrder));
  };
  useEffect(refresh, []);

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Orders</h1>
          <p className="text-muted-foreground mt-1">Commitment: allocated inventory, fulfilment, and the path to invoicing.</p>
        </div>
        {requireQuote ? (
          <Button asChild variant="outline">
            <Link to="/quotes">Start from a Quote</Link>
          </Button>
        ) : (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New sales order
          </Button>
        )}
      </div>

      {requireQuote && (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
          Your workflow settings require a Quote before a Sales Order. Direct creation is off — accept a Quote to create one automatically.
        </p>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const total = order.lines.reduce((s, l) => s + l.lineTotal, 0);
              return (
                <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/sales-orders/${order.id}`)}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell>{customers[order.customerId]?.name ?? order.customerId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{order.sourceQuoteId ?? "Direct"}</TableCell>
                  <TableCell className="text-muted-foreground">{order.lines.length}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {orders.length === 0 && <div className="py-16 text-center text-muted-foreground">No sales orders yet.</div>}
      </Card>

      <CreateSalesOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
    <Outlet />
    </>
  );
}
