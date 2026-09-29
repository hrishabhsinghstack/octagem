import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { markInvoicePaidInFull, recordPayment } from "@/lib/api/paymentApi";
import { localToday, netReceived, remainingBalance, validatePayment, type PaymentProblem } from "@/lib/payment";
import { getList } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import { useEffect, useMemo, useState } from "react";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onRecorded: () => void;
  /** Opens prefilled for the whole outstanding balance — the counter-sale path. */
  payInFull?: boolean;
}


const num = (raw: string) => {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : Number.NaN;
};

export function RecordPaymentDialog({ open, onOpenChange, invoice, onRecorded, payInFull = false }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [receivedAt, setReceivedAt] = useState(localToday());
  const [clearedAt, setClearedAt] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const methods = getList("paymentMethods");
  const accounts = getList("depositAccounts");
  const remaining = invoice ? remainingBalance(invoice) : 0;

  useEffect(() => {
    if (!open) return;
    // Default to the full balance: it's the common case, and retyping a figure the system already knows
    // is only an opportunity to mistype it.
    setAmount(remaining > 0 ? String(remaining) : "");
    setMethod(methods[0]?.label ?? "");
    setDepositAccountId(accounts[0]?.id ?? "");
    setReference("");
    setReceivedAt(localToday());
    setClearedAt("");
    setFee("");
    setNotes("");
    setAttempted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  const problems = useMemo<PaymentProblem[]>(() => {
    if (!invoice) return [];
    return validatePayment({ amount: num(amount), receivedAt, clearedAt: clearedAt || undefined, feeAmount: fee ? num(fee) : undefined }, invoice);
  }, [invoice, amount, receivedAt, clearedAt, fee]);

  const problemFor = (field: PaymentProblem["field"]) => (attempted ? problems.find((problem) => problem.field === field)?.message : undefined);

  const feeValue = fee ? num(fee) : 0;
  const net = Number.isFinite(num(amount)) && Number.isFinite(feeValue) ? netReceived({ amount: num(amount), feeAmount: feeValue }) : 0;
  const isFullSettlement = Number.isFinite(num(amount)) && num(amount) >= remaining;

  const handleSubmit = async () => {
    if (!invoice) return;
    setAttempted(true);
    if (problems.length > 0) {
      showError("Check the payment", problems[0].message);
      return;
    }

    setSaving(true);
    try {
      const shared = {
        method,
        reference,
        depositAccountId: depositAccountId || undefined,
        receivedAt,
        clearedAt: clearedAt || undefined,
        feeAmount: fee ? num(fee) : undefined,
        notes,
      };
      // Same result either way, but going through markInvoicePaidInFull lets the API settle the exact
      // remainder rather than trusting a figure the form rounded.
      const payment = isFullSettlement ? await markInvoicePaidInFull(invoice.id, shared) : await recordPayment({ ...shared, invoiceId: invoice.id, amount: num(amount) });

      showSuccess(
        isFullSettlement ? "Invoice settled" : "Payment recorded",
        isFullSettlement ? `${formatCurrency(payment.amount, invoice.currency)} received — ${invoice.id} is paid in full.` : `${formatCurrency(payment.amount, invoice.currency)} applied to ${invoice.id}.`
      );
      onOpenChange(false);
      onRecorded();
    } catch (error: any) {
      showError("Could not record this payment", error?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {payInFull ? "Settle" : "Record payment —"} {invoice?.id}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Outstanding</span>
            <span className="font-semibold tabular-nums">{formatCurrency(remaining, invoice?.currency)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payment-amount" className="text-xs text-muted-foreground">
                Amount<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn("tabular-nums", problemFor("amount") && "border-destructive")}
              />
              {problemFor("amount") ? (
                <p className="text-xs text-destructive">{problemFor("amount")}</p>
              ) : (
                isFullSettlement && remaining > 0 && <p className="text-xs text-emerald-600">Settles the invoice in full.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="How it arrived" />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((entry) => (
                    <SelectItem key={entry.id} value={entry.label}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Deposited into</Label>
            <Select value={depositAccountId || "none"} onValueChange={(value) => setDepositAccountId(value === "none" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not recorded</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Add accounts under Settings → Master Data → Sales &amp; Finance.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payment-received" className="text-xs text-muted-foreground">
                Received on<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                id="payment-received"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className={cn(problemFor("receivedAt") && "border-destructive")}
              />
              {problemFor("receivedAt") && <p className="text-xs text-destructive">{problemFor("receivedAt")}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-cleared" className="text-xs text-muted-foreground">
                Cleared on
              </Label>
              <Input
                id="payment-cleared"
                type="date"
                value={clearedAt}
                onChange={(e) => setClearedAt(e.target.value)}
                className={cn(problemFor("clearedAt") && "border-destructive")}
              />
              {problemFor("clearedAt") ? (
                <p className="text-xs text-destructive">{problemFor("clearedAt")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Leave blank if still in transit.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payment-reference" className="text-xs text-muted-foreground">
                Reference #
              </Label>
              <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, wire ref, auth code…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-fee" className="text-xs text-muted-foreground">
                Processor fee
              </Label>
              <Input
                id="payment-fee"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
                className={cn("tabular-nums", problemFor("feeAmount") && "border-destructive")}
              />
              {problemFor("feeAmount") ? (
                <p className="text-xs text-destructive">{problemFor("feeAmount")}</p>
              ) : feeValue > 0 ? (
                <p className="text-xs text-muted-foreground">{formatCurrency(net, invoice?.currency)} reaches the bank. The invoice still settles in full.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="payment-notes" className="text-xs text-muted-foreground">
              Notes
            </Label>
            <Textarea id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none text-sm" placeholder="Internal — not shown to the customer." />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Recording…" : isFullSettlement && remaining > 0 ? "Record & settle" : "Record payment"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
