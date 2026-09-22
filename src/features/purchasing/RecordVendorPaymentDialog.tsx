import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordVendorPayment } from "@/lib/api/vendorBillApi";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { PaymentMethod } from "@/types/payment";
import type { VendorBill } from "@/types/vendorBill";
import { useEffect, useState } from "react";

const METHODS: PaymentMethod[] = ["Cash", "Cheque", "Bank Transfer", "Wire", "Card"];

interface RecordVendorPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: VendorBill | null;
  onRecorded: () => void;
}

export function RecordVendorPaymentDialog({ open, onOpenChange, bill, onRecorded }: RecordVendorPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Wire");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = bill ? bill.total - bill.paidAmount : 0;

  useEffect(() => {
    if (open) {
      setAmount(remaining > 0 ? String(remaining) : "");
      setReference("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!bill) return;
    const value = Number(amount);
    if (!value || value <= 0 || value > remaining) {
      showError("Invalid amount", `Enter an amount between $1 and ${formatCurrency(remaining, bill.currency)}.`);
      return;
    }
    setSaving(true);
    try {
      await recordVendorPayment({ vendorBillId: bill.id, method, amount: value, reference });
      showSuccess("Payment recorded", `${formatCurrency(value, bill.currency)} applied to ${bill.id}.`);
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
          <SheetTitle>Record vendor payment — {bill?.id}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Remaining balance: {formatCurrency(remaining, bill?.currency)}</p>
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
