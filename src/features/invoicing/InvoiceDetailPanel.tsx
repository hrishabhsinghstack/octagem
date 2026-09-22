import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { Can } from "@/components/rbac/Can";
import { RecordPaymentDialog } from "@/features/invoicing/RecordPaymentDialog";
import { getCustomer } from "@/lib/api/customerApi";
import { getInvoice, voidInvoice } from "@/lib/api/invoiceApi";
import { listPaymentsForInvoice } from "@/lib/api/paymentApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { getList } from "@/lib/store/masterDataStore";
import { formatCurrency, formatDateShort, showSuccess } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { Payment } from "@/types/payment";
import type { Customer } from "@/types/party";
import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

export function InvoiceDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const refresh = () => {
    if (!id) return;
    getInvoice(id).then(async (found) => {
      setInvoice(found ?? null);
      if (found) {
        const foundCustomer = (await getCustomer(found.customerId)) ?? null;
        setCustomer(foundCustomer);
        setPayments(await listPaymentsForInvoice(found.id));
        recordRecentActivity({ type: "invoice", id: found.id, label: found.id, sublabel: foundCustomer?.name, path: `/invoices/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/invoices");

  if (!invoice) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Invoice not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const remaining = invoice.total - invoice.paidAmount;
  const taxRateLabel = invoice.taxRateId ? getList("taxRates", false).find((t) => t.id === invoice.taxRateId)?.label : undefined;

  const handleVoid = async () => {
    if (!window.confirm(`Void ${invoice.id}? This does not currently reverse the linked item status.`)) return;
    await voidInvoice(invoice.id);
    showSuccess("Voided", `${invoice.id} marked void.`);
    refresh();
  };

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Invoice · {invoice.sourceType}</p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">{invoice.id}</h1>
              <p className="text-muted-foreground mt-1">{customer?.name ?? invoice.customerId}</p>
              <div className="flex items-center gap-3 mt-3">
                <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
                <span className="text-sm text-muted-foreground">Issued {formatDateShort(invoice.issuedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocumentActionButtons
                shareData={{
                  title: `Invoice ${invoice.id}`,
                  text: `Invoice ${invoice.id} for ${customer?.name ?? invoice.customerId} — total ${formatCurrency(invoice.total, invoice.currency)}, balance ${formatCurrency(remaining, invoice.currency)}.`,
                }}
              />
              {invoice.status !== "Paid" && invoice.status !== "Void" && (
                <Can module="invoices" action="approve">
                  <Button onClick={() => setPaymentOpen(true)}>
                    <CreditCard className="h-4 w-4 mr-2" /> Record payment
                  </Button>
                </Can>
              )}
              {invoice.status !== "Void" && (
                <Can module="invoices" action="cancel">
                  <Button variant="outline" onClick={handleVoid}>
                    Void
                  </Button>
                </Can>
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
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.lineTotal, invoice.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col items-end gap-1 mt-4 text-sm">
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.tax > 0 && (
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Tax{taxRateLabel ? ` (${taxRateLabel})` : ""}</span>
                    <span>{formatCurrency(invoice.tax, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex gap-8 font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
                <div className="flex gap-8 text-emerald-600">
                  <span>Paid</span>
                  <span>{formatCurrency(invoice.paidAmount, invoice.currency)}</span>
                </div>
                <div className="flex gap-8 font-semibold">
                  <span>Balance</span>
                  <span>{formatCurrency(remaining, invoice.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment history</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length > 0 ? (
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                      <span>
                        {payment.method} {payment.reference && `· ${payment.reference}`}
                      </span>
                      <span className="text-muted-foreground">{formatDateShort(payment.receivedAt)}</span>
                      <span className="font-medium">{formatCurrency(payment.amount, invoice.currency)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              )}
            </CardContent>
          </Card>

          <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} onRecorded={refresh} />
        </SheetContent>
      </Sheet>

      <PrintableDocument
        documentType="Invoice"
        documentId={invoice.id}
        date={formatDateShort(invoice.issuedAt)}
        statusLabel={`${invoice.status} · Due ${formatDateShort(invoice.dueDate)}`}
        counterpartyLabel="Bill to"
        counterpartyName={customer?.name ?? invoice.customerId}
        counterpartyAddress={customer?.address}
        fields={[{ label: "Salesperson", value: invoice.salesperson }]}
        lines={invoice.lines.map((line) => ({ description: line.description, qty: line.quantity, unitPrice: line.unitPrice, total: line.lineTotal }))}
        currency={invoice.currency}
        subtotal={invoice.subtotal}
        tax={invoice.tax}
        taxLabel={taxRateLabel ? `Tax (${taxRateLabel})` : "Tax"}
        total={invoice.total}
      />
    </>
  );
}
