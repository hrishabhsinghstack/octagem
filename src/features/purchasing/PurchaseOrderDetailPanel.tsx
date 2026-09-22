import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { ReceiveItemDialog } from "@/features/inventory/ReceiveItemDialog";
import { getPurchaseOrder, recordLineReceipt, setPurchaseOrderStatus } from "@/lib/api/purchaseOrderApi";
import { getVendor } from "@/lib/api/vendorApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort, showSuccess } from "@/lib/utils";
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from "@/types/purchaseOrder";
import type { Vendor } from "@/types/party";
import { PackagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const STATUS_VARIANT: Record<PurchaseOrderStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Draft: "outline",
  Sent: "secondary",
  "Partially received": "warning",
  Received: "success",
  Cancelled: "destructive",
};

export function PurchaseOrderDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [receivingLine, setReceivingLine] = useState<PurchaseOrderLine | null>(null);

  const refresh = () => {
    if (!id) return;
    getPurchaseOrder(id).then(async (found) => {
      setOrder(found ?? null);
      if (found) {
        const foundVendor = (await getVendor(found.vendorId)) ?? null;
        setVendor(foundVendor);
        recordRecentActivity({ type: "purchaseOrder", id: found.id, label: found.id, sublabel: foundVendor?.name, path: `/purchase-orders/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/purchase-orders");

  if (!order) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Purchase order not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const handleSend = async () => {
    await setPurchaseOrderStatus(order.id, "Sent");
    refresh();
  };

  const handleCancel = async () => {
    if (!window.confirm(`Cancel ${order.id}?`)) return;
    await setPurchaseOrderStatus(order.id, "Cancelled");
    refresh();
  };

  const handleReceived = async (item?: { id: string }) => {
    if (item && receivingLine) {
      await recordLineReceipt(order.id, receivingLine.id, item.id);
      showSuccess("Received", `${item.id} linked to ${order.id}.`);
    }
    setReceivingLine(null);
    refresh();
  };

  const canReceive = order.status !== "Cancelled" && order.status !== "Draft";
  const poTotal = order.lines.reduce((s, l) => s + l.expectedCost * l.expectedQty, 0);

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Purchase Order</p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">{order.id}</h1>
              <p className="text-muted-foreground mt-1">{vendor?.name ?? order.vendorId}</p>
              <div className="flex items-center gap-3 mt-3">
                <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                <span className="text-sm text-muted-foreground">Expected {formatDateShort(order.expectedDate)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocumentActionButtons
                shareData={{
                  title: `Purchase Order ${order.id}`,
                  text: `Purchase Order ${order.id} to ${vendor?.name ?? order.vendorId} — total ${formatCurrency(poTotal, order.currency)}.`,
                }}
              />
              {order.status === "Draft" && <Button onClick={handleSend}>Send to vendor</Button>}
              {order.status !== "Cancelled" && order.status !== "Received" && (
                <Button variant="outline" onClick={handleCancel}>
                  Cancel PO
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
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Cost ea.</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => {
                    const fullyReceived = line.receivedQty >= line.expectedQty;
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{line.category}</TableCell>
                        <TableCell className="text-right">{line.expectedQty}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.expectedCost, order.currency)}</TableCell>
                        <TableCell className="text-right">
                          {line.receivedQty} / {line.expectedQty}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={!canReceive || fullyReceived} onClick={() => setReceivingLine(line)}>
                            <PackagePlus className="h-3.5 w-3.5 mr-1.5" /> Receive
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-end mt-4 text-sm">
                <span className="text-muted-foreground mr-2">Total</span>
                <span className="font-semibold">{formatCurrency(poTotal, order.currency)}</span>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}

          <ReceiveItemDialog
            open={Boolean(receivingLine)}
            onOpenChange={(open) => !open && setReceivingLine(null)}
            onSaved={handleReceived}
            prefill={receivingLine ? { vendorId: order.vendorId, purchaseOrderId: order.id, category: receivingLine.category, cost: receivingLine.expectedCost } : undefined}
          />
        </SheetContent>
      </Sheet>

      <PrintableDocument
        documentType="Purchase Order"
        documentId={order.id}
        date={formatDateShort(order.issuedAt)}
        statusLabel={`${order.status} · Expected ${formatDateShort(order.expectedDate)}`}
        counterpartyLabel="Vendor"
        counterpartyName={vendor?.name ?? order.vendorId}
        counterpartyAddress={vendor?.address}
        lines={order.lines.map((line) => ({ description: `${line.description} (${line.category})`, qty: line.expectedQty, unitPrice: line.expectedCost, total: line.expectedCost * line.expectedQty }))}
        currency={order.currency}
        subtotal={poTotal}
        total={poTotal}
        notes={order.notes}
      />
    </>
  );
}
