import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createVendor, updateVendor, type VendorPayload } from "@/lib/api/vendorApi";
import { showError, showSuccess } from "@/lib/utils";
import type { Vendor } from "@/types/party";
import { useEffect, useState } from "react";

const EMPTY: VendorPayload = { name: "", contact: "", phone: "", email: "", address: "", paymentTerms: "Net 30", currency: "USD", notes: "" };

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

interface VendorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor | null;
  onSaved: () => void;
}

export function VendorFormDialog({ open, onOpenChange, vendor, onSaved }: VendorFormDialogProps) {
  const [form, setForm] = useState<VendorPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(vendor);

  useEffect(() => {
    if (open) setForm(vendor ? { ...vendor } : EMPTY);
  }, [open, vendor]);

  const set = (field: keyof VendorPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showError("Missing fields", "Vendor name is required.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing && vendor) {
        await updateVendor(vendor.id, form);
        showSuccess("Saved", `${form.name} updated.`);
      } else {
        const created = await createVendor(form);
        showSuccess("Vendor added", `${created.name} added.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Error", error?.message || "Could not save this vendor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit ${vendor?.name}` : "Add vendor"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <Field label="Vendor name *">
            <Input value={form.name} onChange={set("name")} placeholder="Company name" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <Input value={form.contact} onChange={set("contact")} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Payment terms">
              <Input value={form.paymentTerms} onChange={set("paymentTerms")} placeholder="Net 30" />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={set("notes")} rows={2} />
          </Field>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Add vendor"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
