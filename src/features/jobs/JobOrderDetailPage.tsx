import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/authContext";
import { InternalCostDialog } from "@/features/jobs/InternalCostDialog";
import { JobInvoiceDialog } from "@/features/jobs/JobInvoiceDialog";
import { JobMaterialsTab } from "@/features/jobs/JobMaterialsTab";
import { JobOrderFormDialog } from "@/features/jobs/JobOrderFormDialog";
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPE_VARIANT, JOB_STATUS_VARIANT, JOB_STATUSES, JOB_TYPE_LABEL, LEDGER_SOURCE_LABEL } from "@/features/jobs/jobLabels";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { getCustomer } from "@/lib/api/customerApi";
import { deleteJobOrder, getJobOrder, removeCostEntry, setJobEstimate, setJobStatus } from "@/lib/api/jobOrderApi";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { listVendors } from "@/lib/api/vendorApi";
import { buildJobLedger, documentSign, documentTotal, jobIdsForPurchase, summarizeJobCost } from "@/lib/job/costing";
import { recordRecentActivity } from "@/lib/recentActivity";
import { cn, formatCurrency, formatDateShort, formatRelativeTime, showError, showSuccess } from "@/lib/utils";
import { COST_BUCKET_LABELS, COST_BUCKETS, type CostBucket, type JobOrder, type JobStatus } from "@/types/jobOrder";
import type { Customer, Vendor } from "@/types/party";
import type { PurchaseOrder } from "@/types/purchaseOrder";
import { ArrowLeft, FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "good" }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums mt-1", tone === "bad" && "text-destructive", tone === "good" && "text-emerald-700")}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function JobOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canEdit = can("jobs", "edit");
  const canSeeCost = can("jobCosts", "view");
  const baseCurrency = useBaseCurrency();

  const [job, setJob] = useState<JobOrder | null | undefined>(undefined);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [estimateDraft, setEstimateDraft] = useState<Partial<Record<CostBucket, string>>>({});

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [editJobOpen, setEditJobOpen] = useState(false);

  const load = () => {
    if (!id) return;
    Promise.all([getJobOrder(id), listPurchaseOrders(), listVendors()]).then(async ([found, orderList, vendorList]) => {
      setJob(found ?? null);
      setOrders(orderList);
      setVendors(Object.fromEntries(vendorList.map((v) => [v.id, v])));
      setCustomer(found?.customerId ? ((await getCustomer(found.customerId)) ?? null) : null);
    });
  };
  useDataRefresh(load);
  useEffect(load, [id]);

  useEffect(() => {
    if (!job) return;
    recordRecentActivity({ type: "jobOrder", id: job.id, label: job.id, sublabel: job.title, path: `/jobs/${job.id}` });
    setEstimateDraft(Object.fromEntries(Object.entries(job.estimate).map(([bucket, value]) => [bucket, String(value)])));
    // Only when a different job opens — re-reads of the same job must not wipe an estimate being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (job === undefined) return null;
  if (job === null) {
    return (
      <div className="p-8">
        <Link to="/jobs" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Job orders
        </Link>
        <p className="text-muted-foreground mt-6">Job order not found.</p>
      </div>
    );
  }

  const rows = buildJobLedger(job, orders);
  const summary = summarizeJobCost(rows, job.estimate);
  const documents = orders.filter((order) => jobIdsForPurchase(order).includes(job.id));
  const amountOnJob = (orderId: string) => rows.filter((r) => r.purchaseOrderId === orderId).reduce((sum, r) => sum + r.amountBase, 0);
  const cancelled = job.status === "Cancelled";
  const variance = summary.estimateTotal > 0 ? summary.total - summary.estimateTotal : 0;
  // The document-currency column only earns its space when something was bought in another currency.
  const showDocumentAmount = rows.some((row) => row.currency && row.currency !== baseCurrency);

  const changeStatus = async (status: JobStatus) => {
    if (status === "Cancelled" && !window.confirm(`Cancel ${job.id}? Its invoices stay in Purchase Orders, but no new costs can be added.`)) return;
    try {
      await setJobStatus(job.id, status);
      showSuccess("Status updated", `${job.id} is now ${status}.`);
    } catch (error: any) {
      showError("Can't change status", error?.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${job.id}? This can't be undone.`)) return;
    try {
      await deleteJobOrder(job.id);
      showSuccess("Deleted", `${job.id} deleted.`);
      navigate("/jobs");
    } catch (error: any) {
      showError("Can't delete", error?.message);
    }
  };

  const handleRemoveCost = async (entryId: string) => {
    if (!window.confirm("Remove this internal cost?")) return;
    try {
      await removeCostEntry(job.id, entryId);
    } catch (error: any) {
      showError("Can't remove", error?.message);
    }
  };

  const saveEstimate = async () => {
    const estimate: JobOrder["estimate"] = {};
    for (const bucket of COST_BUCKETS) {
      const text = estimateDraft[bucket]?.trim();
      if (text) estimate[bucket] = Number(text);
    }
    try {
      await setJobEstimate(job.id, estimate);
      showSuccess("Estimate saved", `${job.id} estimate updated.`);
    } catch (error: any) {
      showError("Could not save", error?.message);
    }
  };

  const openAddInvoice = () => {
    setEditingOrder(null);
    setInvoiceOpen(true);
  };

  return (
    <div className="p-8 space-y-6 max-w-[1200px]">
      <Link to="/jobs" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Job orders
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Job Order · {JOB_TYPE_LABEL[job.type]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {job.id} <span className="text-muted-foreground font-normal">— {job.title}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            {canEdit ? (
              <Select value={job.status} onValueChange={(v) => changeStatus(v as JobStatus)}>
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={JOB_STATUS_VARIANT[job.status]}>{job.status}</Badge>
            )}
            {customer && (
              <Link to={`/customers/${customer.id}`} className="hover:underline">
                For {customer.name}
              </Link>
            )}
            <span>Opened {formatDateShort(job.openedAt)}</span>
            {job.targetDate && <span>Target {formatDateShort(job.targetDate)}</span>}
            {job.overheadPct > 0 && <span>Overhead {job.overheadPct}%</span>}
          </div>
          {job.notes && <p className="text-sm mt-2 max-w-2xl">{job.notes}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button variant="outline" onClick={() => setEditJobOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          {can("jobs", "delete") && documents.length === 0 && job.costEntries.length === 0 && (
            <Button variant="outline" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          )}
          {canEdit && (
            <Button onClick={openAddInvoice} disabled={cancelled}>
              <FilePlus2 className="h-4 w-4 mr-2" /> Add invoice
            </Button>
          )}
        </div>
      </div>

      {canSeeCost && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Cost so far" value={formatCurrency(summary.total, baseCurrency)} sub={`${summary.documentCount} document${summary.documentCount === 1 ? "" : "s"} · ${job.costEntries.filter((e) => e.source === "Internal").length} internal`} />
          <Stat label="Estimate" value={summary.estimateTotal ? formatCurrency(summary.estimateTotal, baseCurrency) : "—"} sub={summary.estimateTotal ? undefined : "Set one on the Estimate tab"} />
          <Stat
            label={variance > 0 ? "Over estimate" : "Under estimate"}
            value={summary.estimateTotal ? formatCurrency(Math.abs(variance), baseCurrency) : "—"}
            tone={summary.estimateTotal ? (variance > 0 ? "bad" : "good") : undefined}
          />
        </div>
      )}

      <Tabs defaultValue={canSeeCost ? "costs" : "invoices"}>
        <TabsList>
          {canSeeCost && <TabsTrigger value="costs">Costs</TabsTrigger>}
          <TabsTrigger value="invoices">Invoices ({documents.length})</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          {canSeeCost && <TabsTrigger value="estimate">Estimate vs actual</TabsTrigger>}
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {canSeeCost && (
          <TabsContent value="costs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Cost ledger</CardTitle>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setInternalOpen(true)} disabled={cancelled}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Internal cost
                    </Button>
                    <Button size="sm" onClick={openAddInvoice} disabled={cancelled}>
                      <FilePlus2 className="h-3.5 w-3.5 mr-1" /> Add invoice
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No costs yet. Add each vendor invoice for this job as it arrives — diamonds, CAD, casting, labour.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Cost type</TableHead>
                        {showDocumentAmount && <TableHead className="text-right">Document amount</TableHead>}
                        <TableHead className="text-right">{baseCurrency}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateShort(row.occurredAt)}</TableCell>
                          <TableCell>
                            <Badge variant={row.source === "CreditNote" ? "warning" : row.purchaseOrderId ? "secondary" : "outline"}>{LEDGER_SOURCE_LABEL[row.source]}</Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{row.description}</p>
                            {row.purchaseOrderId && (
                              <p className="text-xs text-muted-foreground">
                                {vendors[row.vendorId ?? ""]?.name ?? row.vendorId} · #{row.vendorInvoiceNumber} ·{" "}
                                <Link to={`/purchase-orders/${row.purchaseOrderId}`} className="hover:underline">
                                  {row.purchaseOrderId}
                                </Link>
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{COST_BUCKET_LABELS[row.bucket]}</TableCell>
                          {showDocumentAmount && (
                            <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                              {row.amountDocument !== undefined && row.currency !== baseCurrency ? formatCurrency(row.amountDocument, row.currency) : ""}
                            </TableCell>
                          )}
                          <TableCell className={cn("text-right tabular-nums", row.amountBase < 0 && "text-amber-700")}>{formatCurrency(row.amountBase, baseCurrency)}</TableCell>
                          <TableCell className="w-10">
                            {canEdit && row.costEntryId && row.source === "Internal" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveCost(row.costEntryId!)} aria-label="Remove cost">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={showDocumentAmount ? 5 : 4} className="text-right font-medium">
                          Total
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(summary.total, baseCurrency)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="invoices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Invoices on this job</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={openAddInvoice} disabled={cancelled}>
                  <FilePlus2 className="h-3.5 w-3.5 mr-1" /> Add invoice
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No invoices yet. Each invoice you add is also listed in Purchase Orders.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Shared with</TableHead>
                      {canSeeCost && <TableHead className="text-right">Document total</TableHead>}
                      {canSeeCost && <TableHead className="text-right">On this job ({baseCurrency})</TableHead>}
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((order) => {
                      const others = jobIdsForPurchase(order).filter((other) => other !== job.id);
                      const hasStock = order.lines.some((l) => l.destination.kind === "Stock");
                      return (
                        <TableRow key={order.id}>
                          <TableCell>
                            <Link to={`/purchase-orders/${order.id}`} className="font-medium hover:underline">
                              {order.id}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant={DOCUMENT_TYPE_VARIANT[order.documentType]}>{DOCUMENT_TYPE_LABEL[order.documentType]}</Badge>
                            <p className="text-xs text-muted-foreground mt-0.5">#{order.vendorInvoiceNumber ?? "—"}</p>
                          </TableCell>
                          <TableCell className="text-sm">{vendors[order.vendorId]?.name ?? order.vendorId}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDateShort(order.vendorInvoiceDate ?? order.issuedAt)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {others.map((other) => (
                              <Link key={other} to={`/jobs/${other}`} className="mr-2 hover:underline">
                                {other}
                              </Link>
                            ))}
                            {hasStock && <span>Stock</span>}
                            {others.length === 0 && !hasStock && "—"}
                          </TableCell>
                          {canSeeCost && <TableCell className="text-right tabular-nums text-sm">{formatCurrency(documentSign(order.documentType) * documentTotal(order), order.currency)}</TableCell>}
                          {canSeeCost && <TableCell className="text-right tabular-nums">{formatCurrency(amountOnJob(order.id), baseCurrency)}</TableCell>}
                          <TableCell className="w-10">
                            {canEdit && order.documentType !== "PurchaseOrder" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingOrder(order);
                                  setInvoiceOpen(true);
                                }}
                                aria-label="Edit invoice"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <JobMaterialsTab job={job} baseCurrency={baseCurrency} canSeeCost={canSeeCost} canEdit={canEdit} canMoveStock={canEdit && can("inventory", "edit")} onChanged={load} />
        </TabsContent>

        {canSeeCost && (
          <TabsContent value="estimate">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Estimate vs actual</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Enter what quotations or your own costing said the job would cost. Quotations are not invoices — they never add to the cost.</p>
                </div>
                {canEdit && (
                  <Button size="sm" onClick={saveEstimate}>
                    Save estimate
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cost type</TableHead>
                      <TableHead className="text-right w-40">Estimate ({baseCurrency})</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COST_BUCKETS.map((bucket) => {
                      const estimate = Number(estimateDraft[bucket] ?? "") || 0;
                      const actual = summary.byBucket[bucket] ?? 0;
                      const diff = actual - estimate;
                      if (bucket === "Overhead" && !actual && !estimate) return null;
                      return (
                        <TableRow key={bucket}>
                          <TableCell className="text-sm">{COST_BUCKET_LABELS[bucket]}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              inputMode="decimal"
                              value={estimateDraft[bucket] ?? ""}
                              onChange={(e) => setEstimateDraft((d) => ({ ...d, [bucket]: e.target.value }))}
                              disabled={!canEdit}
                              className="h-8 text-right tabular-nums"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{actual ? formatCurrency(actual, baseCurrency) : "—"}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", estimate && diff > 0 && "text-destructive", estimate && diff < 0 && "text-emerald-700")}>
                            {estimate || actual ? `${diff > 0 ? "+" : ""}${formatCurrency(diff, baseCurrency)}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {job.activity.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-4 text-sm">
                    <span>{entry.note}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {entry.actor} · {formatRelativeTime(entry.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <JobInvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} onSaved={load} editOrder={editingOrder} defaultJobId={job.id} />
      <InternalCostDialog open={internalOpen} onOpenChange={setInternalOpen} jobId={job.id} baseCurrency={baseCurrency} onSaved={load} />
      <JobOrderFormDialog open={editJobOpen} onOpenChange={setEditJobOpen} job={job} onSaved={load} />
    </div>
  );
}
