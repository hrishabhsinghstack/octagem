import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { listInventory } from "@/lib/api/inventoryApi";
import { listCustomers } from "@/lib/api/customerApi";
import { issueMemo } from "@/lib/api/memoApi";
import { daysFromToday } from "@/lib/memo";
import { getList } from "@/lib/store/masterDataStore";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { MemoLine } from "@/types/memo";
import type { Customer } from "@/types/party";
import { useEffect, useState } from "react";

interface IssueMemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: () => void;
  /** Pre-checks this item when the dialog opens, e.g. from an item's own "Issue memo" action. */
  preselectedItemId?: string;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function IssueMemoDialog({ open, onOpenChange, onIssued, preselectedItemId }: IssueMemoDialogProps) {
  const [eligible, setEligible] = useState<InventoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lineBasis, setLineBasis] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [memoToAddress, setMemoToAddress] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [shipVia, setShipVia] = useState("");
  const [terms, setTerms] = useState("");
  const [salesperson, setSalesperson] = useState("Jordan Miller");
  const [dueDate, setDueDate] = useState(daysFromToday(14));

  const [shipViaOptions, setShipViaOptions] = useState<string[]>([]);
  const [termsOptions, setTermsOptions] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      listInventory().then((items) => {
        const eligibleItems = items.filter((item) => item.status === "Available");
        setEligible(eligibleItems);
        if (preselectedItemId && eligibleItems.some((i) => i.id === preselectedItemId)) {
          setSelectedIds((prev) => (prev.includes(preselectedItemId) ? prev : [...prev, preselectedItemId]));
        }
      });
      listCustomers().then(setCustomers);
      const ship = getList("shipViaMethods").map((e) => e.label);
      const paymentTerms = getList("paymentTerms").map((e) => e.label);
      setShipViaOptions(ship);
      setTermsOptions(paymentTerms);
      setShipVia((current) => current || ship[0] || "");
      setTerms((current) => current || paymentTerms[0] || "");
    } else {
      setSelectedIds([]);
      setLineBasis({});
      setCustomerId("");
      setMemoToAddress("");
      setContact("");
      setPhone("");
      setPoNumber("");
      setShipVia("");
      setTerms("");
      setDueDate(daysFromToday(14));
    }
  }, [open]);

  const toggleItem = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      setMemoToAddress((current) => current || customer.address);
      setContact((current) => current || customer.contact);
      setPhone((current) => current || customer.phone);
    }
  };

  const handleSubmit = async () => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer || !contact.trim() || selectedIds.length === 0) {
      showError("Missing fields", "Customer, contact and at least one item are required.");
      return;
    }

    setSaving(true);
    try {
      const lines: Omit<MemoLine, "id">[] = selectedIds.map((id) => {
        const item = eligible.find((i) => i.id === id)!;
        return { itemId: id, priceBasis: lineBasis[id] || `Our price ${formatCurrency(item.askingPrice)}`, quantity: 1, lineTotal: item.askingPrice };
      });

      await issueMemo({
        customerId: customer.id,
        counterparty: customer.name,
        memoToAddress: memoToAddress.trim(),
        shipToAddress: memoToAddress.trim(),
        contact: contact.trim(),
        phone: phone.trim(),
        poNumber: poNumber.trim() || undefined,
        shipVia,
        terms,
        salesperson,
        dueDate,
        lines,
      });
      showSuccess("Memo issued", `Custody transferred to ${customer.name}.`);
      onOpenChange(false);
      onIssued();
    } catch (error: any) {
      showError("Error", error?.message || "Could not issue this memo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg">
        <SheetHeader>
          <SheetTitle>Issue customer memo</SheetTitle>
          <SheetDescription>This is a custody transfer. Ownership, inventory value and revenue stay unchanged until conversion.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Customer *">
            <Select value={customerId} onValueChange={chooseCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Contact *">
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </FieldRow>
          <FieldRow label="Address">
            <Input value={memoToAddress} onChange={(e) => setMemoToAddress(e.target.value)} />
          </FieldRow>
          <FieldRow label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FieldRow>
          <FieldRow label="PO #">
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </FieldRow>
          <FieldRow label="Ship via">
            <Select value={shipVia} onValueChange={setShipVia}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shipViaOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Terms">
            <Select value={terms} onValueChange={setTerms}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {termsOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Salesperson">
            <Input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
          </FieldRow>
          <FieldRow label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FieldRow>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Select items to release (Available only)</p>
          <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-md p-2">
            {eligible.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} className="h-4 w-4" />
                  <span className="text-sm flex-1">
                    {item.code} · {item.title} · {formatCurrency(item.askingPrice)}
                  </span>
                  {checked && (
                    <Input
                      value={lineBasis[item.id] ?? ""}
                      onChange={(e) => setLineBasis((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Price basis (e.g. 22% off Rap)"
                      className="h-7 text-xs w-56"
                    />
                  )}
                </div>
              );
            })}
            {eligible.length === 0 && <p className="text-sm text-muted-foreground px-2 py-4 text-center">No eligible items right now.</p>}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Issuing…" : "Confirm custody transfer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
