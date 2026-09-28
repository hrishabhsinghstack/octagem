import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCustomer } from "@/lib/api/customerApi";
import { listInvoices } from "@/lib/api/invoiceApi";
import { listMemos } from "@/lib/api/memoApi";
import { getList } from "@/lib/store/masterDataStore";
import { deriveMemoRisk, memoExposure } from "@/lib/memo";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { Customer } from "@/types/party";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { MemoRecord, MemoRisk } from "@/types/memo";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

const RISK_VARIANT: Record<MemoRisk, "success" | "warning" | "destructive"> = {
  Healthy: "success",
  "Due soon": "warning",
  Overdue: "destructive",
};

export function CustomerDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [memos, setMemos] = useState<MemoRecord[]>([]);

  useEffect(() => {
    if (!id) return;
    getCustomer(id).then((found) => {
      setCustomer(found ?? null);
      if (found) recordRecentActivity({ type: "customer", id: found.id, label: found.name, sublabel: found.type, path: `/customers/${found.id}` });
    });
    listInvoices().then((all) => setInvoices(all.filter((i) => i.customerId === id)));
    listMemos().then((all) => setMemos(all.filter((m) => m.customerId === id)));
  }, [id]);

  const close = () => navigate("/customers");

  if (!customer) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Customer not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const taxRateLabel = customer.taxRateId ? getList("taxRates", false).find((t) => t.id === customer.taxRateId)?.label : undefined;

  const lifetimeInvoiced = invoices.filter((i) => i.status !== "Void").reduce((sum, i) => sum + i.total, 0);
  const openBalance = invoices.filter((i) => i.status !== "Void").reduce((sum, i) => sum + (i.total - i.paidAmount), 0);
  const openMemos = memos.filter((m) => m.status === "Open");
  const openMemoExposure = openMemos.reduce((sum, m) => sum + memoExposure(m), 0);

  return (
    <Sheet open onOpenChange={(next) => !next && close()}>
      <SheetContent size="formLg" className="p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer · {customer.id}</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{customer.name}</h1>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant="outline">{customer.type}</Badge>
              {customer.salesperson && <span className="text-sm text-muted-foreground">Salesperson: {customer.salesperson}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Lifetime invoiced</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(lifetimeInvoiced)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Open balance</p>
            <p className={`text-lg font-semibold mt-1 ${openBalance > 0 ? "text-destructive" : ""}`}>{formatCurrency(openBalance)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Open memo exposure</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(openMemoExposure)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Open memos</p>
            <p className="text-lg font-semibold mt-1">{openMemos.length}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact &amp; terms</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="font-medium">{customer.contact || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Phone / Email</dt>
                <dd className="font-medium">{customer.phone || customer.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd className="font-medium">{customer.address || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Payment terms</dt>
                <dd className="font-medium">{customer.paymentTerms || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Credit limit</dt>
                <dd className="font-medium">{customer.creditLimit ? formatCurrency(customer.creditLimit) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Default tax rate</dt>
                <dd className="font-medium">{taxRateLabel ?? "—"}</dd>
              </div>
              {customer.currency && (
                <div>
                  <dt className="text-xs text-muted-foreground">Preferred currency</dt>
                  <dd className="font-medium">{customer.currency}</dd>
                </div>
              )}
            </dl>
            {customer.notes && (
              <>
                <p className="text-xs text-muted-foreground mt-4 mb-1">Notes</p>
                <p className="text-sm">{customer.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                      <TableCell className="font-medium">{invoice.id}</TableCell>
                      <TableCell className="text-right">{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(invoice.total - invoice.paidAmount, invoice.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Memos Out</CardTitle>
          </CardHeader>
          <CardContent>
            {memos.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Memo</TableHead>
                    <TableHead className="text-right">Exposure</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memos.map((memo) => {
                    const risk = deriveMemoRisk(memo);
                    return (
                      <TableRow key={memo.id} className="cursor-pointer" onClick={() => navigate(`/memos/${memo.id}`)}>
                        <TableCell className="font-medium">{memo.id}</TableCell>
                        <TableCell className="text-right">{formatCurrency(memoExposure(memo))}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateShort(memo.dueDate)}</TableCell>
                        <TableCell>{memo.status === "Open" ? <Badge variant={RISK_VARIANT[risk]}>{risk}</Badge> : <Badge variant="outline">{memo.status}</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No memos yet.</p>
            )}
          </CardContent>
        </Card>
      </SheetContent>
    </Sheet>
  );
}
