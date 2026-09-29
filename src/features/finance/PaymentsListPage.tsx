import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { listCustomers } from "@/lib/api/customerApi";
import { listInvoices } from "@/lib/api/invoiceApi";
import { listPayments } from "@/lib/api/paymentApi";
import { hasCleared, totalFees, unclearedTotal } from "@/lib/payment";
import { getList } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import type { MasterListEntry } from "@/types/masterData";
import type { Customer } from "@/types/party";
import type { Payment } from "@/types/payment";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/** "Uncleared" is not an account — it's the cross-cutting view someone reconciling actually wants. */
const UNCLEARED = "__uncleared__";

export function PaymentsListPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Record<string, Invoice>>({});
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [accounts, setAccounts] = useState<MasterListEntry[]>([]);
  const [filter, setFilter] = useState<string>("All");

  // Live, so "Mark cleared" on an invoice in another tab moves the payment out of "Not yet cleared" here.
  useDataRefresh(() => {
    // Same-day payments tie-break on id, so a partial and its settlement read in the order they were taken.
    listPayments().then((list) => setPayments([...list].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id))));
    listInvoices().then((list) => setInvoices(Object.fromEntries(list.map((i) => [i.id, i]))));
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
    // Inactive included: a retired account still has to name the payments already banked into it.
    setAccounts(getList("depositAccounts", false));
  });

  const accountLabel = (accountId?: string) => (accountId ? (accounts.find((account) => account.id === accountId)?.label ?? accountId) : "—");

  const visible = useMemo(() => {
    if (filter === "All") return payments;
    if (filter === UNCLEARED) return payments.filter((payment) => !hasCleared(payment));
    return payments.filter((payment) => payment.depositAccountId === filter);
  }, [payments, filter]);

  // Measured across everything, not the current filter — a headline that quietly changes meaning with a
  // dropdown is worse than no headline.
  const totalReceived = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const uncleared = unclearedTotal(payments);
  const fees = totalFees(payments);

  return (
    <div className="p-8 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1">Every payment recorded against an invoice, most recent first.</p>
      </div>

      <div className="flex items-stretch gap-4">
        <Card className="p-5 flex-1">
          <p className="text-xs text-muted-foreground">Total received</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalReceived)}</p>
          <p className="text-xs text-muted-foreground mt-1">{payments.length} payments</p>
        </Card>
        <Card className={cn("p-5 flex-1", uncleared > 0 && "border-amber-500/40")}>
          <p className="text-xs text-muted-foreground">Not yet cleared</p>
          <p className={cn("text-2xl font-semibold mt-1", uncleared > 0 && "text-amber-600")}>{formatCurrency(uncleared)}</p>
          <button type="button" onClick={() => setFilter(UNCLEARED)} className="text-xs text-muted-foreground mt-1 hover:text-foreground hover:underline text-left">
            Banked but unconfirmed
          </button>
        </Card>
        <Card className="p-5 flex-1">
          <p className="text-xs text-muted-foreground">Processor fees</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(fees)}</p>
          <p className="text-xs text-muted-foreground mt-1">A cost to the business, not a shortfall</p>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All payments</SelectItem>
            <SelectItem value={UNCLEARED}>Not yet cleared</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {visible.length} of {payments.length}
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payment</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Deposited into</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((payment) => {
              const invoice = invoices[payment.invoiceId];
              return (
                <TableRow key={payment.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${payment.invoiceId}`)}>
                  <TableCell className="font-medium">{payment.id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.invoiceId}</TableCell>
                  <TableCell>{customers[payment.customerId]?.name ?? payment.customerId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.method}
                    {payment.reference && <span className="block text-xs">{payment.reference}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{accountLabel(payment.depositAccountId)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(payment.receivedAt)}</TableCell>
                  <TableCell>
                    {hasCleared(payment) ? (
                      <Badge variant="outline" className="font-normal">
                        Cleared {formatDateShort(payment.clearedAt!)}
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="font-normal">
                        In transit
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(payment.amount, invoice?.currency)}
                    {payment.feeAmount ? (
                      <span className="block text-xs font-normal text-muted-foreground">less {formatCurrency(payment.feeAmount, invoice?.currency)} fee</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {visible.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">{payments.length === 0 ? "No payments recorded yet." : "No payments match this filter."}</div>
        )}
      </Card>
    </div>
  );
}
