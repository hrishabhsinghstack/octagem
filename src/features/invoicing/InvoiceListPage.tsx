import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Can } from "@/components/rbac/Can";
import { useAuth } from "@/contexts/authContext";
import { CreateInvoiceDialog } from "@/features/invoicing/CreateInvoiceDialog";
import { listCustomers } from "@/lib/api/customerApi";
import { listInvoices } from "@/lib/api/invoiceApi";
import { formatCurrency } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { Customer } from "@/types/party";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

export function InvoiceListPage() {
  const navigate = useNavigate();
  const { session, scopeFor } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listInvoices().then(setInvoices);
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
  };
  useEffect(refresh, []);

  const scope = scopeFor("invoices");
  const visibleInvoices = useMemo(
    () => (scope === "own" ? invoices.filter((i) => i.salesperson === session?.name) : invoices),
    [invoices, scope, session?.name]
  );

  const openBalance = visibleInvoices.filter((i) => i.status !== "Void").reduce((sum, i) => sum + (i.total - i.paidAmount), 0);

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

      <Card className="p-5 w-fit">
        <p className="text-xs text-muted-foreground">Open receivable balance</p>
        <p className="text-2xl font-semibold mt-1">{formatCurrency(openBalance)}</p>
      </Card>

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleInvoices.map((invoice) => (
              <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                <TableCell className="font-medium">{invoice.id}</TableCell>
                <TableCell>{customers[invoice.customerId]?.name ?? invoice.customerId}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{invoice.sourceType}</TableCell>
                <TableCell className="text-right">{formatCurrency(invoice.total)}</TableCell>
                <TableCell className="text-right text-emerald-600">{formatCurrency(invoice.paidAmount)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(invoice.total - invoice.paidAmount)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visibleInvoices.length === 0 && <div className="py-16 text-center text-muted-foreground">No invoices yet.</div>}
      </Card>

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => navigate(`/invoices/${id}`)} />
    </div>
    <Outlet />
    </>
  );
}
