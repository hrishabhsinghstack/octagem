import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordPayment } from "@/lib/api/paymentApi";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import type { PaymentMethod } from "@/types/payment";
import { useEffect, useState } from "react";

const METHODS: PaymentMethod[] = ["Cash", "Cheque", "Bank Transfer", "Wire", "Card"];

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onRecorded: () => void;
}

export function RecordPaymentDialog({ open, onOpenChange, invoice, onRecorded }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Wire");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = invoice ? invoice.total - invoice.paidAmount : 0;

  useEffect(() => {
    if (open) {
      setAmount(remaining > 0 ? String(remaining) : "");
      setReference("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!invoice) return;
    const value = Number(amount);
    if (!value || value <= 0 || value > remaining) {
      showError("Invalid amount", `Enter an amount between $1 and ${formatCurrency(remaining)}.`);
      return;
    }
    setSaving(true);
    try {
      await recordPayment({ invoiceId: invoice.id, method, amount: value, reference });
      showSuccess("Payment recorded", `${formatCurrency(value)} applied to ${invoice.id}.`);
      onOpenChange(false);
      onRecorded();
    } catch (error: any) {
      showError("Error", error?.message || "Could not record this payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>Record payment — {invoice?.id}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Remaining balance: {formatCurrency(remaining)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Amount *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Reference #</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, wire ref…" className="mt-1" />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Recording…" : "Record payment"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
