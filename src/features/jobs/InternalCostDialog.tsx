import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addInternalCost } from "@/lib/api/jobOrderApi";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import { COST_BUCKET_LABELS, COST_BUCKETS, type CostBucket } from "@/types/jobOrder";
import { useEffect, useState } from "react";

interface InternalCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  baseCurrency: string;
  onSaved: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** A cost with no vendor invoice behind it — the job's own setters and polishers, a cash fee. Entered in base currency. */
export function InternalCostDialog({ open, onOpenChange, jobId, baseCurrency, onSaved }: InternalCostDialogProps) {
  const [occurredAt, setOccurredAt] = useState(today());
  const [bucket, setBucket] = useState<CostBucket>("Labour");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"amount" | "hours">("hours");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOccurredAt(today());
    setBucket("Labour");
    setDescription("");
    setAmount("");
    setHours("");
    setRate("");
  }, [open]);

  const computed = mode === "hours" ? (Number(hours) || 0) * (Number(rate) || 0) : Number(amount) || 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await addInternalCost(
        jobId,
        mode === "hours"
          ? { occurredAt, bucket, description, hours: Number(hours), ratePerHour: Number(rate) }
          : { occurredAt, bucket, description, amountBase: Number(amount) },
      );
      showSuccess("Cost added", `${formatCurrency(computed, baseCurrency)} added to ${jobId}.`);
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not add", error?.message || "Could not add this cost.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>Add internal cost</SheetTitle>
          <p className="text-sm text-muted-foreground">For work and costs with no vendor invoice — in-house setters, polishers, cash fees. Amounts are in {baseCurrency}.</p>
        </SheetHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ic-date" className="text-xs text-muted-foreground">Date</Label>
              <Input id="ic-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="ic-bucket" className="text-xs text-muted-foreground">Cost type</Label>
              <Select value={bucket} onValueChange={(v) => setBucket(v as CostBucket)}>
                <SelectTrigger id="ic-bucket" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COST_BUCKETS.filter((b) => b !== "Overhead").map((b) => (
                    <SelectItem key={b} value={b}>
                      {COST_BUCKET_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="ic-description" className="text-xs text-muted-foreground">Description *</Label>
            <Input id="ic-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Setting — halo rings, R. Fields" className="mt-1" />
          </div>
          <div className="inline-flex rounded-md border p-0.5">
            {(["hours", "amount"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn("rounded px-3 py-1 text-xs", mode === option ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {option === "hours" ? "Hours × rate" : "Fixed amount"}
              </button>
            ))}
          </div>
          {mode === "hours" ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="ic-hours" className="text-xs text-muted-foreground">Hours</Label>
                <Input id="ic-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="ic-rate" className="text-xs text-muted-foreground">Rate per hour ({baseCurrency})</Label>
                <Input id="ic-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1" />
              </div>
              <div className="self-end pb-2 text-sm">
                = <span className="font-semibold tabular-nums">{formatCurrency(computed, baseCurrency)}</span>
              </div>
            </div>
          ) : (
            <div className="w-1/3">
              <Label htmlFor="ic-amount" className="text-xs text-muted-foreground">Amount ({baseCurrency})</Label>
              <Input id="ic-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
            </div>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Adding…" : "Add cost"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
