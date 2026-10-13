import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { useAuth } from "@/contexts/authContext";
import { ReceiveItemDialog } from "@/features/inventory/ReceiveItemDialog";
import { JobInvoiceDialog } from "@/features/jobs/JobInvoiceDialog";
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPE_VARIANT, LINE_TYPE_LABEL } from "@/features/jobs/jobLabels";
import { deleteJobInvoice, getPurchaseOrder, recordLineReceipt, setPurchaseOrderStatus } from "@/lib/api/purchaseOrderApi";
import { getVendor } from "@/lib/api/vendorApi";
import { chargesTotal, documentTotal, isJobDocument, jobIdsForPurchase, lineValue, linesSubtotal } from "@/lib/job/costing";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort, showError, showSuccess } from "@/lib/utils";
import { COST_BUCKET_LABELS } from "@/types/jobOrder";
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from "@/types/purchaseOrder";
import type { Vendor } from "@/types/party";
import { Hammer, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
  const { can } = useAuth();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [receivingLine, setReceivingLine] = useState<PurchaseOrderLine | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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

  const jobDocument = isJobDocument(order);
  const jobs = jobIdsForPurchase(order);
  const docLabel = DOCUMENT_TYPE_LABEL[order.documentType];

  const handleSend = async () => {
    await setPurchaseOrderStatus(order.id, "Sent");
    refresh();
  };

  const handleCancel = async () => {
    const warning = jobs.length ? ` Its cost will be taken off ${jobs.join(", ")}.` : "";
    if (!window.confirm(`Cancel ${order.id}?${warning}`)) return;
    await setPurchaseOrderStatus(order.id, "Cancelled");
    refresh();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${order.id} (${docLabel.toLowerCase()} ${order.vendorInvoiceNumber})? Its cost is removed from ${jobs.join(", ") || "its jobs"}.`)) return;
    try {
      await deleteJobInvoice(order.id);
      showSuccess("Deleted", `${order.id} deleted.`);
      close();
    } catch (error: any) {
      showError("Can't delete", error?.message);
    }
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
  const subtotal = linesSubtotal(order);
  const extras = chargesTotal(order.charges);
  const total = documentTotal(order);
  const chargeRows = [
    ["Shipping", order.charges.shipping],
    ["Insurance", order.charges.insurance],
    ["Customs / duty", order.charges.duty],
    ["Other charges", order.charges.other],
    ["Discount", -order.charges.discount],
  ].filter(([, value]) => value) as [string, number][];

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{jobDocument ? docLabel : "Purchase Order"}</p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">{order.id}</h1>
              <p className="text-muted-foreground mt-1">{vendor?.name ?? order.vendorId}</p>
              <div className="flex items-center gap-3 mt-3">
                <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                {jobDocument ? (
                  <span className="text-sm text-muted-foreground">
                    #{order.vendorInvoiceNumber} · dated {formatDateShort(order.vendorInvoiceDate ?? order.issuedAt)}
                    {order.entryMethod === "AIScan" && " · scanned"}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Expected {formatDateShort(order.expectedDate)}</span>
                )}
              </div>
            </div>
            {/* mr-8 keeps the buttons clear of the sheet's own close button in the corner. */}
            <div className="flex items-center gap-2 shrink-0 mr-8">
              <DocumentActionButtons
                shareData={{
                  title: `${docLabel} ${order.id}`,
                  text: `${docLabel} ${order.id} — ${vendor?.name ?? order.vendorId} — total ${formatCurrency(total, order.currency)}.`,
                }}
              />
              {jobDocument && can("jobs", "edit") && (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
              {jobDocument && can("purchaseOrders", "delete") && (
                <Button variant="outline" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              )}
              {order.status === "Draft" && <Button onClick={handleSend}>Send to vendor</Button>}
              {!jobDocument && order.status !== "Cancelled" && order.status !== "Received" && (
                <Button variant="outline" onClick={handleCancel}>
                  Cancel PO
                </Button>
              )}
            </div>
          </div>

          {jobs.length > 0 && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <Hammer className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                <Badge variant={DOCUMENT_TYPE_VARIANT[order.documentType]} className="mr-2">
                  {docLabel}
                </Badge>
                Charged to{" "}
                {jobs.map((jobId, index) => (
                  <span key={jobId}>
                    {index > 0 && ", "}
                    <Link to={`/jobs/${jobId}`} className="font-medium underline-offset-2 hover:underline">
                      {jobId}
                    </Link>
                  </span>
                ))}
                {order.lines.some((l) => l.destination.kind === "Stock") && " and stock"}.
                {order.creditForPoId && (
                  <>
                    {" "}
                    Reverses{" "}
                    <Link to={`/purchase-orders/${order.creditForPoId}`} className="underline-offset-2 hover:underline">
                      {order.creditForPoId}
                    </Link>
                    .
                  </>
                )}
              </span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Goes to</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price ea.</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => {
                    const toStock = line.destination.kind === "Stock";
                    const fullyReceived = line.receivedQty >= line.expectedQty;
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {LINE_TYPE_LABEL[line.lineType]}
                          {line.bucket && COST_BUCKET_LABELS[line.bucket] !== LINE_TYPE_LABEL[line.lineType] ? ` · ${COST_BUCKET_LABELS[line.bucket]}` : line.category ? ` · ${line.category}` : ""}
                        </TableCell>
                        <TableCell className="text-sm">
                          {line.destination.kind === "Job" ? (
                            <Link to={`/jobs/${line.destination.jobId}`} className="hover:underline">
                              {line.destination.jobId}
                            </Link>
                          ) : (
                            "Stock"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.expectedQty} {line.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(line.expectedCost, order.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(lineValue(line), order.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{toStock ? `${line.receivedQty} / ${line.expectedQty}` : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right">
                          {toStock && (
                            <Button size="sm" variant="outline" disabled={!canReceive || fullyReceived} onClick={() => setReceivingLine(line)}>
                              <PackagePlus className="h-3.5 w-3.5 mr-1.5" /> Receive
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-end mt-4">
                <dl className="w-72 space-y-1 text-sm">
                  {(chargeRows.length > 0 || order.tax.amount > 0) && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Lines</dt>
                      <dd className="tabular-nums">{formatCurrency(subtotal, order.currency)}</dd>
                    </div>
                  )}
                  {chargeRows.map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">{formatCurrency(value, order.currency)}</dd>
                    </div>
                  ))}
                  {order.tax.amount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tax{order.tax.recoverable ? " (reclaimable)" : ""}</dt>
                      <dd className="tabular-nums">{formatCurrency(order.tax.amount, order.currency)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{formatCurrency(total, order.currency)}</dd>
                  </div>
                </dl>
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
          {jobDocument && <JobInvoiceDialog open={editOpen} onOpenChange={setEditOpen} onSaved={refresh} editOrder={order} />}
        </SheetContent>
      </Sheet>

      <PrintableDocument
        documentType={jobDocument ? docLabel : "Purchase Order"}
        documentId={order.id}
        date={formatDateShort(order.vendorInvoiceDate ?? order.issuedAt)}
        statusLabel={jobDocument ? `Vendor #${order.vendorInvoiceNumber}${jobs.length ? ` · Jobs ${jobs.join(", ")}` : ""}` : `${order.status} · Expected ${formatDateShort(order.expectedDate)}`}
        counterpartyLabel="Vendor"
        counterpartyName={vendor?.name ?? order.vendorId}
        counterpartyAddress={vendor?.address}
        lines={[
          ...order.lines.map((line) => ({
            description: `${line.description} (${line.destination.kind === "Job" ? line.destination.jobId : (line.category ?? "Stock")})`,
            qty: line.expectedQty,
            unitPrice: line.expectedCost,
            total: lineValue(line),
          })),
          ...(extras ? [{ description: chargeRows.map(([label]) => label).join(", "), total: extras }] : []),
        ]}
        currency={order.currency}
        subtotal={subtotal + extras}
        tax={order.tax.amount || undefined}
        total={total}
        notes={order.notes}
      />
    </>
  );
}
