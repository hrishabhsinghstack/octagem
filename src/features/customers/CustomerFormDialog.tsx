import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createCustomer, updateCustomer, type CustomerPayload } from "@/lib/api/customerApi";
import { showError, showSuccess } from "@/lib/utils";
import type { Customer, CustomerType } from "@/types/party";
import { useEffect, useState } from "react";

const EMPTY: CustomerPayload = { name: "", type: "Retailer", contact: "", phone: "", email: "", address: "", paymentTerms: "Net 14 on conversion", creditLimit: undefined, salesperson: "", notes: "" };
const CUSTOMER_TYPES: CustomerType[] = ["Individual", "Retailer", "Wholesaler", "Other"];

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved: () => void;
}

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: CustomerFormDialogProps) {
  const [form, setForm] = useState<CustomerPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(customer);

  useEffect(() => {
    if (open) setForm(customer ? { ...customer } : EMPTY);
  }, [open, customer]);

  const set = (field: keyof CustomerPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showError("Missing fields", "Customer name is required.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing && customer) {
        await updateCustomer(customer.id, form);
        showSuccess("Saved", `${form.name} updated.`);
      } else {
        const created = await createCustomer(form);
        showSuccess("Customer added", `${created.name} added.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Error", error?.message || "Could not save this customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit ${customer?.name}` : "Add customer"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="Customer name *">
              <Input value={form.name} onChange={set("name")} placeholder="Company or individual name" />
            </Field>
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as CustomerType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
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
              <Input value={form.paymentTerms} onChange={set("paymentTerms")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Credit limit">
              <Input type="number" value={form.creditLimit ?? ""} onChange={(e) => setForm((f) => ({ ...f, creditLimit: Number(e.target.value) }))} />
            </Field>
            <Field label="Salesperson">
              <Input value={form.salesperson ?? ""} onChange={set("salesperson")} />
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
            {saving ? "Saving…" : isEditing ? "Save changes" : "Add customer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
