import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers } from "@/lib/api/customerApi";
import { listInvoices } from "@/lib/api/invoiceApi";
import { listPayments } from "@/lib/api/paymentApi";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import type { Customer } from "@/types/party";
import type { Payment } from "@/types/payment";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function PaymentsListPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Record<string, Invoice>>({});
  const [customers, setCustomers] = useState<Record<string, Customer>>({});

  useEffect(() => {
    listPayments().then((list) => setPayments([...list].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))));
    listInvoices().then((list) => setInvoices(Object.fromEntries(list.map((i) => [i.id, i]))));
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
  }, []);

  const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-8 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1">Every payment recorded against an invoice, most recent first.</p>
      </div>

      <Card className="p-5 w-fit">
        <p className="text-xs text-muted-foreground">Total received</p>
        <p className="text-2xl font-semibold mt-1">{formatCurrency(totalReceived)}</p>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payment</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const invoice = invoices[payment.invoiceId];
              return (
                <TableRow key={payment.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${payment.invoiceId}`)}>
                  <TableCell className="font-medium">{payment.id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.invoiceId}</TableCell>
                  <TableCell>{customers[payment.customerId]?.name ?? payment.customerId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.method}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.reference || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(payment.receivedAt)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(payment.amount, invoice?.currency)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {payments.length === 0 && <div className="py-16 text-center text-muted-foreground">No payments recorded yet.</div>}
      </Card>
    </div>
  );
}
