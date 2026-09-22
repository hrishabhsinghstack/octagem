import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listVendors } from "@/lib/api/vendorApi";
import { createMemoIn } from "@/lib/api/memoInApi";
import { daysFromToday } from "@/lib/memo";
import { showError, showSuccess } from "@/lib/utils";
import type { InventoryCategory } from "@/types/inventory";
import type { Vendor } from "@/types/party";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface LineDraft {
  id: string;
  description: string;
  category: InventoryCategory;
  expectedQty: string;
  priceBasis: string;
}

const emptyLine = (): LineDraft => ({ id: crypto.randomUUID(), description: "", category: "Diamond", expectedQty: "1", priceBasis: "" });

interface CreateMemoInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateMemoInDialog({ open, onOpenChange, onCreated }: CreateMemoInDialogProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [vendorRef, setVendorRef] = useState("");
  const [salesperson, setSalesperson] = useState("Jordan Miller");
  const [dueDate, setDueDate] = useState(daysFromToday(60));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      listVendors().then((v) => {
        setVendors(v);
        setVendorId((current) => current || v[0]?.id || "");
      });
    } else {
      setVendorId("");
      setContact("");
      setPhone("");
      setVendorRef("");
      setNotes("");
      setLines([emptyLine()]);
      setDueDate(daysFromToday(60));
    }
  }, [open]);

  const chooseVendor = (id: string) => {
    setVendorId(id);
    const vendor = vendors.find((v) => v.id === id);
    if (vendor) {
      setContact((current) => current || vendor.contact);
      setPhone((current) => current || vendor.phone);
    }
  };

  const addLine = () => setLines((rows) => [...rows, emptyLine()]);
  const removeLine = (id: string) => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const updateLine = (id: string, patch: Partial<LineDraft>) => setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSubmit = async () => {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor || !contact.trim()) {
      showError("Missing fields", "Select a vendor and provide a contact.");
      return;
    }
    const validLines = lines.filter((l) => l.description.trim() && Number(l.expectedQty) > 0);
    if (validLines.length === 0) {
      showError("Missing fields", "Add at least one line with a description and quantity.");
      return;
    }
    setSaving(true);
    try {
      const record = await createMemoIn({
        vendorId: vendor.id,
        counterparty: vendor.name,
        contact: contact.trim(),
        phone: phone.trim(),
        vendorRef: vendorRef.trim() || undefined,
        salesperson,
        dueDate,
        notes,
        lines: validLines.map((l) => ({ description: l.description.trim(), category: l.category, expectedQty: Number(l.expectedQty), priceBasis: l.priceBasis.trim() })),
      });
      showSuccess("Memo In created", `${record.id} ready to receive against.`);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      showError("Error", error?.message || "Could not create this Memo In.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg">
        <SheetHeader>
          <SheetTitle>New Memo In</SheetTitle>
          <SheetDescription>Goods received on consignment — no ownership change, no cost layer. A vendor bill is created automatically if/when an item sells.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Vendor *</Label>
            <Select value={vendorId} onValueChange={chooseVendor}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Vendor's reference #</Label>
            <Input value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} className="mt-1" placeholder="Optional" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contact *</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Salesperson</Label>
            <Input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Due back</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground">Expected lines</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_110px_70px_1fr_28px] gap-2 items-center">
                <Input value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} placeholder="Description" />
                <Select value={line.category} onValueChange={(v) => updateLine(line.id, { category: v as InventoryCategory })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diamond">Diamond</SelectItem>
                    <SelectItem value="Jewelry">Jewelry</SelectItem>
                    <SelectItem value="Watch">Watch</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={line.expectedQty} onChange={(e) => updateLine(line.id, { expectedQty: e.target.value })} placeholder="Qty" />
                <Input value={line.priceBasis} onChange={(e) => updateLine(line.id, { priceBasis: e.target.value })} placeholder="Price basis, e.g. $5,800 net if sold" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)} className="h-9 w-9">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create Memo In"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
