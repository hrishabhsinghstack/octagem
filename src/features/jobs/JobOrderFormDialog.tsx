import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { JOB_TYPE_HELP, JOB_TYPE_LABEL } from "@/features/jobs/jobLabels";
import { listCustomers } from "@/lib/api/customerApi";
import { createJobOrder, updateJobOrder } from "@/lib/api/jobOrderApi";
import { getJobSettings } from "@/lib/api/settingsApi";
import { cn, showError, showSuccess } from "@/lib/utils";
import type { JobOrder, JobType } from "@/types/jobOrder";
import type { Customer } from "@/types/party";
import { useEffect, useState } from "react";

interface JobOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edits this job when set; otherwise opens a new one. */
  job?: JobOrder | null;
  onSaved: (job: JobOrder) => void;
}

const JOB_TYPES: JobType[] = ["Production", "CustomerOrder", "Rework"];

export function JobOrderFormDialog({ open, onOpenChange, job, onSaved }: JobOrderFormDialogProps) {
  const isEditing = Boolean(job);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [type, setType] = useState<JobType>("Production");
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");
  const [overheadPct, setOverheadPct] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listCustomers().then(setCustomers);
    if (job) {
      setType(job.type);
      setTitle(job.title);
      setCustomerId(job.customerId ?? "");
      setTargetDate(job.targetDate ?? "");
      setNotes(job.notes);
      setOverheadPct(String(job.overheadPct));
    } else {
      setType("Production");
      setTitle("");
      setCustomerId("");
      setTargetDate("");
      setNotes("");
      getJobSettings().then((s) => setOverheadPct(String(s.defaultOverheadPct)));
    }
  }, [open, job]);

  const handleSave = async () => {
    const payload = { type, title, customerId: customerId || undefined, targetDate, notes, overheadPct: Number(overheadPct) || 0 };
    setSaving(true);
    try {
      const saved = isEditing && job ? await updateJobOrder(job.id, payload) : await createJobOrder(payload);
      if (saved) {
        showSuccess(isEditing ? "Saved" : "Job order opened", isEditing ? `${saved.id} updated.` : `${saved.id} is ready for invoices.`);
        onOpenChange(false);
        onSaved(saved);
      }
    } catch (error: any) {
      showError("Could not save", error?.message || "Could not save this job order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit ${job?.id}` : "New job order"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Job type</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {JOB_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={cn("rounded-md border px-3 py-2 text-left transition-colors", type === option ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
                >
                  <p className="text-sm font-medium">{JOB_TYPE_LABEL[option]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{JOB_TYPE_HELP[option]}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="jo-title" className="text-xs text-muted-foreground">Title *</Label>
            <Input id="jo-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Halo ring collection — 5 pieces" className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="jo-customer" className="text-xs text-muted-foreground">Customer{type === "CustomerOrder" ? " *" : ""}</Label>
              <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
                <SelectTrigger id="jo-customer" className="mt-1">
                  <SelectValue placeholder="No customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="jo-target" className="text-xs text-muted-foreground">Target date</Label>
              <Input id="jo-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="jo-overhead" className="text-xs text-muted-foreground">Workshop overhead %</Label>
              <Input id="jo-overhead" inputMode="decimal" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)} className="mt-1" />
            </div>
            <p className="col-span-2 self-end text-xs text-muted-foreground pb-2">Added on top of every invoice and internal cost on this job. Leave at 0 for none.</p>
          </div>
          <div>
            <Label htmlFor="jo-notes" className="text-xs text-muted-foreground">Notes</Label>
            <Textarea id="jo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Open job order"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
