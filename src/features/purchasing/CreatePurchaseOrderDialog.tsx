import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listVendors } from "@/lib/api/vendorApi";
import { createPurchaseOrder } from "@/lib/api/purchaseOrderApi";
import { getList } from "@/lib/store/masterDataStore";
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
  expectedCost: string;
}

const emptyLine = (): LineDraft => ({ id: crypto.randomUUID(), description: "", category: "Diamond", expectedQty: "1", expectedCost: "" });

interface CreatePurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreatePurchaseOrderDialog({ open, onOpenChange, onCreated }: CreatePurchaseOrderDialogProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [expectedDate, setExpectedDate] = useState(daysFromToday(14));
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const currencies = getList("currencies");
  const selectedVendor = vendors.find((v) => v.id === vendorId);

  useEffect(() => {
    if (open) {
      listVendors().then((v) => {
        setVendors(v);
        setVendorId((current) => current || v[0]?.id || "");
      });
    } else {
      setVendorId("");
      setNotes("");
      setLines([emptyLine()]);
      setExpectedDate(daysFromToday(14));
    }
  }, [open]);

  useEffect(() => {
    if (selectedVendor) setCurrency(selectedVendor.currency || "USD");
  }, [vendorId, selectedVendor]);

  const addLine = () => setLines((rows) => [...rows, emptyLine()]);
  const removeLine = (id: string) => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const updateLine = (id: string, patch: Partial<LineDraft>) => setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSubmit = async () => {
    if (!vendorId) {
      showError("Missing fields", "Select a vendor.");
      return;
    }
    const validLines = lines.filter((l) => l.description.trim() && Number(l.expectedQty) > 0);
    if (validLines.length === 0) {
      showError("Missing fields", "Add at least one line with a description and quantity.");
      return;
    }
    setSaving(true);
    try {
      const order = await createPurchaseOrder({
        vendorId,
        expectedDate,
        notes,
        currency,
        lines: validLines.map((l) => ({ description: l.description.trim(), category: l.category, expectedQty: Number(l.expectedQty), expectedCost: Number(l.expectedCost) || 0 })),
      });
      showSuccess("Purchase order created", `${order.id} sent to vendor.`);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      showError("Error", error?.message || "Could not create this purchase order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg">
        <SheetHeader>
          <SheetTitle>New purchase order</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
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
            <Label className="text-xs text-muted-foreground">Expected date</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.id} value={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground">Lines</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_110px_90px_100px_28px] gap-2 items-center">
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
                <Input type="number" value={line.expectedCost} onChange={(e) => updateLine(line.id, { expectedCost: e.target.value })} placeholder="Cost ea." />
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
            {saving ? "Creating…" : "Create purchase order"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
