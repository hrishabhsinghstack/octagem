import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Can } from "@/components/rbac/Can";
import { useAuth } from "@/contexts/authContext";
import { JobOrderFormDialog } from "@/features/jobs/JobOrderFormDialog";
import { JOB_STATUS_VARIANT, JOB_STATUSES, JOB_TYPE_LABEL } from "@/features/jobs/jobLabels";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { listCustomers } from "@/lib/api/customerApi";
import { listJobOrders } from "@/lib/api/jobOrderApi";
import { listPurchaseOrders } from "@/lib/api/purchaseOrderApi";
import { buildJobLedger, summarizeJobCost, type JobCostSummary } from "@/lib/job/costing";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";
import type { JobOrder, JobStatus } from "@/types/jobOrder";
import type { Customer } from "@/types/party";
import { Hammer, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type StatusFilter = "active" | "all" | JobStatus;

export function JobOrderListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canSeeCost = can("jobCosts", "view");
  const baseCurrency = useBaseCurrency();
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [summaries, setSummaries] = useState<Record<string, JobCostSummary>>({});
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useDataRefresh(() => {
    Promise.all([listJobOrders(), listPurchaseOrders(), listCustomers()]).then(([jobList, orders, customerList]) => {
      setJobs(jobList);
      setSummaries(Object.fromEntries(jobList.map((job) => [job.id, summarizeJobCost(buildJobLedger(job, orders), job.estimate)])));
      setCustomers(Object.fromEntries(customerList.map((c) => [c.id, c])));
    });
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter === "active" && (job.status === "Completed" || job.status === "Cancelled")) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!q) return true;
      return [job.id, job.title, customers[job.customerId ?? ""]?.name ?? ""].some((text) => text.toLowerCase().includes(q));
    });
  }, [jobs, statusFilter, query, customers]);

  return (
    <div className="p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job Orders</h1>
          <p className="text-muted-foreground mt-1">Each job collects the vendor invoices and in-house costs of making a batch of jewelry.</p>
        </div>
        <Can module="jobs" action="create">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New job order
          </Button>
        </Can>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search job #, title, customer" className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active (open & in production)</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invoices</TableHead>
              {canSeeCost && <TableHead className="text-right">Cost so far</TableHead>}
              {canSeeCost && <TableHead className="text-right">Estimate</TableHead>}
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((job) => {
              const summary = summaries[job.id];
              const overBudget = summary && summary.estimateTotal > 0 && summary.total > summary.estimateTotal;
              return (
                <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                  <TableCell className="font-medium">{job.id}</TableCell>
                  <TableCell>
                    <p>{job.title}</p>
                    <p className="text-xs text-muted-foreground">{JOB_TYPE_LABEL[job.type]}</p>
                  </TableCell>
                  <TableCell className="text-sm">{job.customerId ? (customers[job.customerId]?.name ?? job.customerId) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant={JOB_STATUS_VARIANT[job.status]}>{job.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{summary?.documentCount ?? 0}</TableCell>
                  {canSeeCost && <TableCell className={cn("text-right tabular-nums", overBudget && "text-destructive font-medium")}>{formatCurrency(summary?.total ?? 0, baseCurrency)}</TableCell>}
                  {canSeeCost && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">{summary?.estimateTotal ? formatCurrency(summary.estimateTotal, baseCurrency) : "—"}</TableCell>
                  )}
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(job.targetDate ?? null) || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {visible.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <Hammer className="h-6 w-6" />
            <p>{jobs.length === 0 ? "No job orders yet. Open one, then add each vendor invoice to it as it arrives." : "No job orders match these filters."}</p>
          </div>
        )}
      </Card>

      <JobOrderFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(job) => navigate(`/jobs/${job.id}`)} />
    </div>
  );
}
