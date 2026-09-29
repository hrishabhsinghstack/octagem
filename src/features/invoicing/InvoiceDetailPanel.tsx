import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { Can } from "@/components/rbac/Can";
import { InvoiceEditorDialog } from "@/features/invoicing/InvoiceEditorDialog";
import { InvoiceSentBadge, InvoiceStatusBadge } from "@/features/invoicing/invoiceBadges";
import { RecordPaymentDialog } from "@/features/invoicing/RecordPaymentDialog";
import { SendInvoiceDialog } from "@/features/invoicing/SendInvoiceDialog";
import { getCustomer } from "@/lib/api/customerApi";
import { deleteDraftInvoice, getInvoice, issueInvoice, voidInvoice } from "@/lib/api/invoiceApi";
import { listPaymentsForInvoice } from "@/lib/api/paymentApi";
import { canDeleteInvoice, canEditInvoice, canIssueInvoice, canRecordPayment, canSendInvoice, canVoidInvoice, invoiceBalance } from "@/lib/invoice";
import { recordRecentActivity } from "@/lib/recentActivity";
import { getList } from "@/lib/store/masterDataStore";
import { formatCurrency, formatDateShort, showError, showSuccess } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import type { Payment } from "@/types/payment";
import type { Customer } from "@/types/party";
import { CreditCard, FileCheck2, Gem, Mail, Pencil, Trash2, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function InvoiceDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const remaining = invoiceBalance(invoice);
  const taxRateLabel = invoice.taxRateId ? getList("taxRates", false).find((t) => t.id === invoice.taxRateId)?.label : undefined;
  const isDraft = invoice.status === "Draft";

  const handleIssue = async () => {
    setBusy(true);
    try {
      await issueInvoice(invoice.id);
      showSuccess("Issued", `${invoice.id} is now open — the items on it are marked Sold.`);
      refresh();
    } catch (error: any) {
      showError("Could not issue", error?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete draft ${invoice.id}? Nothing has been committed, so this leaves no trace.`)) return;
    setBusy(true);
    try {
      await deleteDraftInvoice(invoice.id);
      showSuccess("Draft deleted", `${invoice.id} discarded.`);
      close();
    } catch (error: any) {
      showError("Could not delete", error?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

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
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <InvoiceStatusBadge status={invoice.status} />
                <InvoiceSentBadge invoice={invoice} />
                <span className="text-sm text-muted-foreground">
                  {isDraft ? "Created" : "Issued"} {formatDateShort(invoice.issuedAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {!isDraft && (
                <DocumentActionButtons
                  shareData={{
                    title: `Invoice ${invoice.id}`,
                    text: `Invoice ${invoice.id} for ${customer?.name ?? invoice.customerId} — total ${formatCurrency(invoice.total, invoice.currency)}, balance ${formatCurrency(remaining, invoice.currency)}.`,
                  }}
                />
              )}
              {canEditInvoice(invoice) && (
                <Can module="invoices" action="edit">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                </Can>
              )}
              {canIssueInvoice(invoice) && (
                <Can module="invoices" action="approve">
                  <Button disabled={busy} onClick={handleIssue}>
                    <FileCheck2 className="h-4 w-4 mr-2" /> Issue invoice
                  </Button>
                </Can>
              )}
              {canSendInvoice(invoice) && (
                <Can module="invoices" action="print">
                  <Button variant={invoice.sentAt ? "outline" : "default"} onClick={() => setSendOpen(true)}>
                    <Mail className="h-4 w-4 mr-2" /> {invoice.sentAt ? "Resend" : "Send"}
                  </Button>
                </Can>
              )}
              {canRecordPayment(invoice) && (
                <Can module="invoices" action="approve">
                  <Button variant="outline" onClick={() => setPaymentOpen(true)}>
                    <CreditCard className="h-4 w-4 mr-2" /> Record payment
                  </Button>
                </Can>
              )}
              {canDeleteInvoice(invoice) && (
                <Can module="invoices" action="delete">
                  <Button variant="ghost" disabled={busy} onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                </Can>
              )}
              {canVoidInvoice(invoice) && (
                <Can module="invoices" action="cancel">
                  <Button variant="outline" onClick={handleVoid}>
                    Void
                  </Button>
                </Can>
              )}
            </div>
          </div>

          {isDraft && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              This is a <span className="font-medium text-foreground">draft</span>. Nothing is committed: the items on it are still available to sell, no money is
              owed, and it is not counted in receivables. Issuing it marks those items Sold.
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
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span title={line.itemId ? "From inventory" : "Free-text charge"}>
                            {line.itemId ? <Gem className="h-3.5 w-3.5 text-muted-foreground" /> : <Type className="h-3.5 w-3.5 text-muted-foreground" />}
                          </span>
                          {line.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(line.unitPrice, invoice.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(line.lineTotal, invoice.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col items-end gap-1 mt-4 text-sm">
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="tabular-nums">−{formatCurrency(invoice.discount, invoice.currency)}</span>
                  </div>
                )}
                {invoice.tax > 0 && (
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Tax{taxRateLabel ? ` (${taxRateLabel})` : ""}</span>
                    <span className="tabular-nums">{formatCurrency(invoice.tax, invoice.currency)}</span>
                  </div>
                )}
                {invoice.shipping > 0 && (
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="tabular-nums">{formatCurrency(invoice.shipping, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex gap-8 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
                {!isDraft && (
                  <>
                    <div className="flex gap-8 text-emerald-600">
                      <span>Paid</span>
                      <span className="tabular-nums">{formatCurrency(invoice.paidAmount, invoice.currency)}</span>
                    </div>
                    <div className="flex gap-8 font-semibold">
                      <span>Balance</span>
                      <span className="tabular-nums">{formatCurrency(remaining, invoice.currency)}</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes &amp; terms</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{invoice.notes}</p>
              </CardContent>
            </Card>
          )}

          {!isDraft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sent to customer</CardTitle>
              </CardHeader>
              <CardContent>
                {invoice.sends.length > 0 ? (
                  <div className="space-y-2">
                    {[...invoice.sends].reverse().map((send) => (
                      <div key={send.id} className="flex items-center justify-between gap-4 text-sm border rounded-md px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate">{send.to}</span>
                          <span className="block text-xs text-muted-foreground truncate">{send.subject}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 text-right">
                          {formatDateShort(send.sentAt.slice(0, 10))}
                          <span className="block">by {send.sentBy}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not sent yet — this invoice is issued but the customer has not been emailed it.</p>
                )}
              </CardContent>
            </Card>
          )}

          {!isDraft && (
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
                        <span className="font-medium tabular-nums">{formatCurrency(payment.amount, invoice.currency)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} onRecorded={refresh} />
          <SendInvoiceDialog open={sendOpen} onOpenChange={setSendOpen} invoice={invoice} customer={customer} onSent={refresh} />
          <InvoiceEditorDialog open={editOpen} onOpenChange={setEditOpen} editInvoice={invoice} onSaved={refresh} />
        </SheetContent>
      </Sheet>

      {/* Drafts are not documents yet — printing one would put an uncommitted invoice in front of a customer. */}
      {!isDraft && (
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
          notes={invoice.notes}
        />
      )}
    </>
  );
}
