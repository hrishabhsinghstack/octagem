import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPE_VARIANT } from "@/features/jobs/jobLabels";
import { CreatePurchaseOrderDialog } from "@/features/purchasing/CreatePurchaseOrderDialog";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { listVendors } from "@/lib/api/vendorApi";
import { documentSign, documentTotal, isJobDocument, jobIdsForPurchase } from "@/lib/job/costing";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/types/purchaseOrder";
import type { Vendor } from "@/types/party";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";

/** "orders": purchase orders we raised; "jobDocuments": vendor invoices and credit notes entered against job orders. */
type KindFilter = "all" | "orders" | "jobDocuments";

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
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [jobFilter, setJobFilter] = useState("all");

  const refresh = () => {
    listPurchaseOrders().then(setOrders);
    listVendors().then((list) => setVendors(Object.fromEntries(list.map((v) => [v.id, v]))));
  };

  useDataRefresh(refresh);

  const jobIds = useMemo(() => [...new Set(orders.flatMap((o) => jobIdsForPurchase(o)))].sort(), [orders]);
  const visible = orders.filter((order) => {
    if (kindFilter === "orders" && isJobDocument(order)) return false;
    if (kindFilter === "jobDocuments" && !isJobDocument(order)) return false;
    if (jobFilter !== "all" && !jobIdsForPurchase(order).includes(jobFilter)) return false;
    return true;
  });

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Vendor orders and receiving, plus every vendor invoice entered against a job order.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New purchase order
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All documents</SelectItem>
            <SelectItem value="orders">Purchase orders only</SelectItem>
            <SelectItem value="jobDocuments">Job invoices & credit notes only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any job</SelectItem>
            {jobIds.map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Job(s)</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((order) => {
              const jobs = jobIdsForPurchase(order);
              return (
                <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/purchase-orders/${order.id}`)}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell>
                    <Badge variant={DOCUMENT_TYPE_VARIANT[order.documentType]}>{DOCUMENT_TYPE_LABEL[order.documentType]}</Badge>
                    {order.vendorInvoiceNumber && <p className="text-xs text-muted-foreground mt-0.5">#{order.vendorInvoiceNumber}</p>}
                  </TableCell>
                  <TableCell>{vendors[order.vendorId]?.name ?? order.vendorId}</TableCell>
                  <TableCell className="text-sm">
                    {jobs.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      jobs.map((jobId) => (
                        <Link key={jobId} to={`/jobs/${jobId}`} onClick={(e) => e.stopPropagation()} className="mr-2 hover:underline">
                          {jobId}
                        </Link>
                      ))
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(order.vendorInvoiceDate ?? order.expectedDate)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatCurrency(documentSign(order.documentType) * documentTotal(order), order.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {visible.length === 0 && <div className="py-16 text-center text-muted-foreground">{orders.length === 0 ? "No purchase orders yet." : "Nothing matches these filters."}</div>}
      </Card>

      <CreatePurchaseOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
    <Outlet />
    </>
  );
}
