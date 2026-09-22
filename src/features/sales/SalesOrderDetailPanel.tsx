import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { getCustomer } from "@/lib/api/customerApi";
import { getItem } from "@/lib/api/inventoryApi";
import { createInvoiceFromSalesOrder } from "@/lib/api/invoiceApi";
import { cancelSalesOrder, fulfilLine, getSalesOrder } from "@/lib/api/salesOrderApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { SalesOrder, SalesOrderStatus } from "@/types/salesOrder";
import type { Customer } from "@/types/party";
import { Check, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const STATUS_VARIANT: Record<SalesOrderStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Draft: "outline",
  Allocated: "secondary",
  "Partially fulfilled": "warning",
  Fulfilled: "success",
  Invoiced: "success",
  Cancelled: "destructive",
};

export function SalesOrderDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<Record<string, InventoryItem>>({});
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    if (!id) return;
    getSalesOrder(id).then(async (found) => {
      setOrder(found ?? null);
      if (found) {
        const foundCustomer = (await getCustomer(found.customerId)) ?? null;
        setCustomer(foundCustomer);
        const resolved = await Promise.all(found.lines.map((l) => getItem(l.itemId)));
        const byId: Record<string, InventoryItem> = {};
        resolved.forEach((item) => item && (byId[item.id] = item));
        setItems(byId);
        recordRecentActivity({ type: "salesOrder", id: found.id, label: found.id, sublabel: foundCustomer?.name, path: `/sales-orders/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/sales-orders");

  if (!order) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Sales order not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const total = order.lines.reduce((s, l) => s + l.lineTotal, 0);
  const canFulfil = order.status === "Allocated" || order.status === "Partially fulfilled";
  const canInvoice = (order.status === "Fulfilled" || order.status === "Partially fulfilled") && order.lines.some((l) => l.fulfilled);
  const canCancel = order.status !== "Cancelled" && order.status !== "Invoiced";

  const handleFulfil = async (lineId: string) => {
    setBusy(true);
    await fulfilLine(order.id, lineId);
    setBusy(false);
    refresh();
  };

  const handleCancel = async () => {
    if (!window.confirm(`Cancel ${order.id}? Unfulfilled allocations are released back to Available.`)) return;
    setBusy(true);
    await cancelSalesOrder(order.id);
    setBusy(false);
    showSuccess("Cancelled", `${order.id} cancelled.`);
    refresh();
  };

  const handleGenerateInvoice = async () => {
    setBusy(true);
    const invoice = await createInvoiceFromSalesOrder(order, Object.values(items));
    setBusy(false);
    showSuccess("Invoice created", `${invoice.id} generated from ${order.id}.`);
    navigate(`/invoices/${invoice.id}`);
  };

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Sales Order{order.sourceQuoteId && ` · from ${order.sourceQuoteId}`}</p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">{order.id}</h1>
              <p className="text-muted-foreground mt-1">{customer?.name ?? order.customerId}</p>
              <div className="flex items-center gap-3 mt-3">
                <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocumentActionButtons
                shareData={{
                  title: `Sales Order ${order.id}`,
                  text: `Sales Order ${order.id} for ${customer?.name ?? order.customerId} — total ${formatCurrency(total, order.currency)}.`,
                }}
              />
              {canCancel && (
                <Button variant="outline" onClick={handleCancel} disabled={busy}>
                  Cancel order
                </Button>
              )}
              {canInvoice && (
                <Button onClick={handleGenerateInvoice} disabled={busy}>
                  <ReceiptText className="h-4 w-4 mr-2" /> Generate invoice
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Price basis</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => {
                    const item = items[line.itemId];
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{item ? `${item.code} · ${item.title}` : line.itemId}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{line.priceBasis}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineTotal, order.currency)}</TableCell>
                        <TableCell>{line.fulfilled ? <Badge variant="success">Fulfilled</Badge> : <Badge variant="outline">Allocated</Badge>}</TableCell>
                        <TableCell className="text-right">
                          {!line.fulfilled && canFulfil && (
                            <Button size="sm" variant="outline" onClick={() => handleFulfil(line.id)} disabled={busy}>
                              <Check className="h-3.5 w-3.5 mr-1.5" /> Fulfil
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-end mt-4 text-sm">
                <span className="text-muted-foreground mr-2">Total</span>
                <span className="font-semibold">{formatCurrency(total, order.currency)}</span>
              </div>
            </CardContent>
          </Card>
        </SheetContent>
      </Sheet>

      <PrintableDocument
        documentType="Sales Order"
        documentId={order.id}
        date={formatDateShort(order.orderedAt)}
        statusLabel={order.status}
        counterpartyLabel="Sold to"
        counterpartyName={customer?.name ?? order.customerId}
        counterpartyAddress={customer?.address}
        fields={[
          { label: "Salesperson", value: order.salesperson },
          ...(order.sourceQuoteId ? [{ label: "From Quote", value: order.sourceQuoteId }] : []),
        ]}
        lines={order.lines.map((line) => ({ description: `${items[line.itemId]?.code ?? line.itemId} · ${items[line.itemId]?.title ?? ""} (${line.priceBasis})`, total: line.lineTotal }))}
        currency={order.currency}
        subtotal={total}
        total={total}
      />
    </>
  );
}
