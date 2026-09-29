import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { ScreenLineTable } from "@/components/documents/ScreenLineTable";
import { Can } from "@/components/rbac/Can";
import { useDocumentRender } from "@/hooks/useDocumentRender";
import { usePrintPageStyle } from "@/hooks/usePrintPageStyle";
import { InvoiceEditorDialog } from "@/features/invoicing/InvoiceEditorDialog";
import { InvoiceSentBadge, InvoiceStatusBadge } from "@/features/invoicing/invoiceBadges";
import { RecordPaymentDialog } from "@/features/invoicing/RecordPaymentDialog";
import { SaveAsTemplateDialog } from "@/features/invoicing/SaveAsTemplateDialog";
import { SendInvoiceDialog } from "@/features/invoicing/SendInvoiceDialog";
import { getCustomer } from "@/lib/api/customerApi";
import { listTemplates } from "@/lib/api/documentTemplateApi";
import { getItem } from "@/lib/api/inventoryApi";
import { deleteDraftInvoice, getInvoice, issueInvoice, setInvoiceTemplate, voidInvoice } from "@/lib/api/invoiceApi";
import { listPaymentsForInvoice, markPaymentCleared } from "@/lib/api/paymentApi";
import type { DocumentLineInput } from "@/lib/document/renderDocument";
import { canDeleteInvoice, canEditInvoice, canIssueInvoice, canRecordPayment, canSendInvoice, canVoidInvoice, invoiceBalance } from "@/lib/invoice";
import { hasCleared, unclearedTotal } from "@/lib/payment";
import { recordRecentActivity } from "@/lib/recentActivity";
import { getList } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, formatDateShort, showError, showSuccess } from "@/lib/utils";
import type { DocumentTemplate } from "@/types/documentTemplate";
import type { InventoryItem } from "@/types/inventory";
import type { Invoice } from "@/types/invoice";
import type { Payment } from "@/types/payment";
import type { Customer } from "@/types/party";
import { CheckCheck, CreditCard, FileCheck2, LayoutTemplate, Mail, Pencil, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * Loads the invoice, then hands off. Split because useDocumentRender must run unconditionally, and the
 * "not found" state would otherwise sit between the hooks and their use.
 */
export function InvoiceDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [items, setItems] = useState<Record<string, InventoryItem>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = () => {
    if (!id) return;
    getInvoice(id).then(async (found) => {
      setInvoice(found ?? null);
      setLoaded(true);
      if (!found) return;

      const foundCustomer = (await getCustomer(found.customerId)) ?? null;
      setCustomer(foundCustomer);
      setPayments(await listPaymentsForInvoice(found.id));

      // Templates can pull any catalog field off the stock record, so the items have to be resolved —
      // without them a "Carat" column would silently print blanks and then auto-hide itself.
      const stockIds = found.lines.map((line) => line.itemId).filter((itemId): itemId is string => Boolean(itemId));
      const resolved = await Promise.all(stockIds.map((itemId) => getItem(itemId)));
      const byId: Record<string, InventoryItem> = {};
      resolved.forEach((item) => item && (byId[item.id] = item));
      setItems(byId);

      recordRecentActivity({ type: "invoice", id: found.id, label: found.id, sublabel: foundCustomer?.name, path: `/invoices/${found.id}` });
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/invoices");

  if (!invoice) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">{loaded ? "Invoice not found." : "Loading…"}</p>
        </SheetContent>
      </Sheet>
    );
  }

  return <InvoiceDetailContent invoice={invoice} customer={customer} payments={payments} items={items} onChanged={refresh} onClose={close} />;
}

interface ContentProps {
  invoice: Invoice;
  customer: Customer | null;
  payments: Payment[];
  items: Record<string, InventoryItem>;
  onChanged: () => void;
  onClose: () => void;
}

function InvoiceDetailContent({ invoice, customer, payments, items, onChanged, onClose }: ContentProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payInFull, setPayInFull] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [busy, setBusy] = useState(false);

  const isDraft = invoice.status === "Draft";
  const remaining = invoiceBalance(invoice);
  const taxRateLabel = invoice.taxRateId ? getList("taxRates", false).find((t) => t.id === invoice.taxRateId)?.label : undefined;
  const uncleared = unclearedTotal(payments);
  // Inactive entries included: an account retired after a payment was banked still has to be nameable.
  const depositAccountLabel = (accountId: string) => getList("depositAccounts", false).find((account) => account.id === accountId)?.label ?? accountId;

  useEffect(() => {
    listTemplates("invoice").then(setTemplates);
  }, []);

  const lines: DocumentLineInput[] = useMemo(
    () =>
      invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        item: line.itemId ? items[line.itemId] : undefined,
      })),
    [invoice.lines, items]
  );

  const amounts = useMemo(
    () => ({
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      tax: invoice.tax,
      shipping: invoice.shipping,
      total: invoice.total,
      paid: invoice.paidAmount,
    }),
    [invoice]
  );

  const rendered = useDocumentRender({
    kind: "invoice",
    templateId: invoice.templateId,
    lines,
    amounts,
    currency: invoice.currency,
    notes: invoice.notes,
  });

  usePrintPageStyle(rendered.options);

  /* ------------------------------------------------------------ actions */

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(true);
    try {
      await action();
      showSuccess("Done", success);
      onChanged();
    } catch (error: any) {
      showError(failure, error?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleIssue = () =>
    run(() => issueInvoice(invoice.id), `${invoice.id} is now open — the items on it are marked Sold.`, "Could not issue");

  const handleDelete = async () => {
    if (!window.confirm(`Delete draft ${invoice.id}? Nothing has been committed, so this leaves no trace.`)) return;
    setBusy(true);
    try {
      await deleteDraftInvoice(invoice.id);
      showSuccess("Draft deleted", `${invoice.id} discarded.`);
      onClose();
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
    onChanged();
  };

  const handleTemplateChange = (templateId: string) =>
    run(() => setInvoiceTemplate(invoice.id, templateId), "Layout updated.", "Could not change the layout");

  const handleMarkCleared = (paymentId: string) => run(() => markPaymentCleared(paymentId), "Payment marked as cleared.", "Could not mark it cleared");

  const openPayment = (full: boolean) => {
    setPayInFull(full);
    setPaymentOpen(true);
  };

  /* ------------------------------------------------------------ render */

  const activeTemplateId = templates.find((template) => template.id === invoice.templateId)?.id ?? "";

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && onClose()}>
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
                  <Button variant="outline" onClick={() => openPayment(false)}>
                    <CreditCard className="h-4 w-4 mr-2" /> Record payment
                  </Button>
                  {/* The counter case: one click instead of retyping a figure the system already knows. */}
                  <Button variant="outline" onClick={() => openPayment(true)}>
                    <CheckCheck className="h-4 w-4 mr-2" /> Mark paid in full
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
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="text-base">Lines</CardTitle>
              <Can module="invoices" action="print">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Select value={activeTemplateId || "__default__"} onValueChange={(value) => handleTemplateChange(value === "__default__" ? "" : value)}>
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue placeholder="Layout" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Company default</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSaveTemplateOpen(true)}>
                    <Save className="h-3 w-3 mr-1" /> Save as template
                  </Button>
                </div>
              </Can>
            </CardHeader>
            <CardContent>
              {/* The same resolved columns the PDF prints — this is where a diamond invoice gains
                  carat/colour/clarity on screen without anyone configuring the screen separately. */}
              <ScreenLineTable columns={rendered.columns} rows={rendered.rows} emptyMessage="No lines on this invoice yet." />

              <div className="flex flex-col items-end gap-1 mt-4 text-sm">
                {rendered.totals
                  .filter((row) => !(isDraft && (row.key === "paid" || row.key === "balance")))
                  .map((row) => (
                    <div key={row.key} className={cn("flex gap-8", row.emphasis && "font-semibold", row.key === "paid" && "text-emerald-600")}>
                      <span className={cn(!row.emphasis && "text-muted-foreground")}>
                        {row.label}
                        {row.key === "tax" && taxRateLabel ? ` (${taxRateLabel})` : ""}
                      </span>
                      <span className="tabular-nums">{row.text}</span>
                    </div>
                  ))}
              </div>

              {rendered.diagnostics.some((d) => d.reason === "unknownField") && (
                <p className="text-xs text-amber-600 mt-3">
                  This layout refers to a catalog field that no longer exists. Open Settings → Document Templates to fix it.
                </p>
              )}
              {rendered.diagnostics.some((d) => d.reason === "unidentifiedLine") && (
                <p className="text-xs text-amber-600 mt-3">
                  {rendered.diagnostics.filter((d) => d.reason === "unidentifiedLine").length} line
                  {rendered.diagnostics.filter((d) => d.reason === "unidentifiedLine").length === 1 ? "" : "s"} would print as an amount with nothing naming
                  {rendered.diagnostics.filter((d) => d.reason === "unidentifiedLine").length === 1 ? " it" : " them"} — this layout has no Description column. Add
                  one in Settings → Document Templates.
                </p>
              )}
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes &amp; terms</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
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
              <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="text-base">Payment history</CardTitle>
                {uncleared > 0 && (
                  <span className="text-xs text-amber-600">{formatCurrency(uncleared, invoice.currency)} not yet cleared</span>
                )}
              </CardHeader>
              <CardContent>
                {payments.length > 0 ? (
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-4 text-sm border rounded-md px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate">
                            {payment.method}
                            {payment.reference && <span className="text-muted-foreground"> · {payment.reference}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {formatDateShort(payment.receivedAt)}
                            {payment.depositAccountId && ` → ${depositAccountLabel(payment.depositAccountId)}`}
                            {payment.feeAmount ? ` · ${formatCurrency(payment.feeAmount, invoice.currency)} fee` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {hasCleared(payment) ? (
                            <span className="text-xs text-muted-foreground">Cleared {formatDateShort(payment.clearedAt!)}</span>
                          ) : (
                            <Can module="payments" action="edit">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => handleMarkCleared(payment.id)}>
                                <CheckCheck className="h-3 w-3 mr-1" /> Mark cleared
                              </Button>
                            </Can>
                          )}
                          <span className="font-medium tabular-nums">{formatCurrency(payment.amount, invoice.currency)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} onRecorded={onChanged} payInFull={payInFull} />
          <SendInvoiceDialog open={sendOpen} onOpenChange={setSendOpen} invoice={invoice} customer={customer} onSent={onChanged} />
          <InvoiceEditorDialog open={editOpen} onOpenChange={setEditOpen} editInvoice={invoice} onSaved={onChanged} />
          <SaveAsTemplateDialog
            open={saveTemplateOpen}
            onOpenChange={setSaveTemplateOpen}
            invoiceId={invoice.id}
            templateId={invoice.templateId}
            lines={lines}
            onSaved={onChanged}
          />
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
          currency={invoice.currency}
          // Ignored in favour of `render`, but kept so the prop contract stays honest for other callers.
          lines={invoice.lines.map((line) => ({ description: line.description, qty: line.quantity, unitPrice: line.unitPrice, total: line.lineTotal }))}
          subtotal={invoice.subtotal}
          tax={invoice.tax}
          total={invoice.total}
          notes={invoice.notes}
          render={rendered}
        />
      )}
    </>
  );
}
