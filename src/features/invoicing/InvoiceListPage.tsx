import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Can } from "@/components/rbac/Can";
import { useAuth } from "@/contexts/authContext";
import { InvoiceEditorDialog } from "@/features/invoicing/InvoiceEditorDialog";
import { InvoiceSentBadge, InvoiceStatusBadge } from "@/features/invoicing/invoiceBadges";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { listCustomers } from "@/lib/api/customerApi";
import { listInvoices } from "@/lib/api/invoiceApi";
import { countsTowardsReceivables, isAwaitingSend } from "@/lib/invoice";
import { cn, formatCurrency } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { Customer } from "@/types/party";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const STATUSES: InvoiceStatus[] = ["Draft", "Open", "Partially paid", "Paid", "Void"];

/** "Awaiting send" is not a status — it's issued-and-never-emailed, which is the list people chase. */
type StatusFilter = InvoiceStatus | "All" | "Awaiting send";

export function InvoiceListPage() {
  const navigate = useNavigate();
  const { session, scopeFor } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const refresh = () => {
    listInvoices().then(setInvoices);
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
  };
  useDataRefresh(refresh);

  const scope = scopeFor("invoices");
  const scoped = useMemo(() => (scope === "own" ? invoices.filter((i) => i.salesperson === session?.name) : invoices), [invoices, scope, session?.name]);

  const visibleInvoices = useMemo(() => {
    if (statusFilter === "All") return scoped;
    if (statusFilter === "Awaiting send") return scoped.filter(isAwaitingSend);
    return scoped.filter((i) => i.status === statusFilter);
  }, [scoped, statusFilter]);

  // Receivables are measured on everything in scope, not the current filter — a filtered total that
  // silently changes meaning is worse than no total.
  const openBalance = scoped.filter(countsTowardsReceivables).reduce((sum, i) => sum + (i.total - i.paidAmount), 0);
  const draftCount = scoped.filter((i) => i.status === "Draft").length;
  const awaitingSend = scoped.filter(isAwaitingSend).length;

  return (
    <>
      <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
            <p className="text-muted-foreground mt-1">Revenue-recognizing documents — raised directly, or converted from a Memo.</p>
          </div>
          <Can module="invoices" action="create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New invoice
            </Button>
          </Can>
        </div>

        <div className="flex items-stretch gap-4">
          <Card className="p-5 flex-1">
            <p className="text-xs text-muted-foreground">Open receivable balance</p>
            <p className="text-2xl font-semibold mt-1">{formatCurrency(openBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">Issued and unpaid — drafts excluded</p>
          </Card>
          <Card className="p-5 flex-1">
            <p className="text-xs text-muted-foreground">Drafts</p>
            <p className="text-2xl font-semibold mt-1">{draftCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Not committed — no stock held, nothing owed</p>
          </Card>
          <Card className={cn("p-5 flex-1", awaitingSend > 0 && "border-amber-500/40")}>
            <p className="text-xs text-muted-foreground">Awaiting send</p>
            <p className={cn("text-2xl font-semibold mt-1", awaitingSend > 0 && "text-amber-600")}>{awaitingSend}</p>
            <button
              type="button"
              onClick={() => setStatusFilter("Awaiting send")}
              className="text-xs text-muted-foreground mt-1 hover:text-foreground hover:underline text-left"
            >
              Unpaid and not yet emailed
            </button>
          </Card>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All invoices</SelectItem>
              <SelectItem value="Awaiting send">Awaiting send</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {visibleInvoices.length} of {scoped.length}
          </p>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleInvoices.map((invoice) => {
                const isDraft = invoice.status === "Draft";
                return (
                  <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>{customers[invoice.customerId]?.name ?? invoice.customerId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{invoice.sourceType}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(invoice.total)}</TableCell>
                    {/* A draft has no payment story — showing 0.00 twice reads as "unpaid", which it isn't. */}
                    <TableCell className="text-right tabular-nums text-emerald-600">{isDraft ? "—" : formatCurrency(invoice.paidAmount)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{isDraft ? "—" : formatCurrency(invoice.total - invoice.paidAmount)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell>
                      <InvoiceSentBadge invoice={invoice} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {visibleInvoices.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">{scoped.length === 0 ? "No invoices yet." : "No invoices match this filter."}</div>
          )}
        </Card>

        <InvoiceEditorDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(id) => navigate(`/invoices/${id}`)} />
      </div>
      <Outlet />
    </>
  );
}
