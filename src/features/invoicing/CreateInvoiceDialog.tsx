import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDirectInvoice } from "@/lib/api/invoiceApi";
import { listInventory } from "@/lib/api/inventoryApi";
import { listCustomers } from "@/lib/api/customerApi";
import { getTaxRatePercent } from "@/lib/currency";
import { getList } from "@/lib/store/masterDataStore";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { Customer } from "@/types/party";
import { useEffect, useState } from "react";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
}

export function CreateInvoiceDialog({ open, onOpenChange, onCreated }: CreateInvoiceDialogProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [salesperson, setSalesperson] = useState("Jordan Miller");
  const [eligible, setEligible] = useState<InventoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("USD");
  const [taxRateId, setTaxRateId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const currencies = getList("currencies");
  const taxRates = getList("taxRates");
  const selectedCustomer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (open) {
      listCustomers().then((list) => {
        setCustomers(list);
        setCustomerId((current) => current || list[0]?.id || "");
      });
      listInventory().then((items) => setEligible(items.filter((item) => item.status === "Available")));
    } else {
      setSelectedIds([]);
      setPrices({});
    }
  }, [open]);

  useEffect(() => {
    if (selectedCustomer) {
      setCurrency(selectedCustomer.currency || "USD");
      setTaxRateId(selectedCustomer.taxRateId || "");
    }
  }, [customerId, selectedCustomer]);

  const toggleItem = (item: InventoryItem) => {
    setSelectedIds((prev) => (prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]));
    setPrices((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: String(item.askingPrice) }));
  };

  const handleSubmit = async () => {
    if (!customerId || selectedIds.length === 0) {
      showError("Missing fields", "Select a customer and at least one item.");
      return;
    }
    setSaving(true);
    try {
      const items = selectedIds.map((id) => ({ item: eligible.find((i) => i.id === id)!, unitPrice: Number(prices[id] || 0) }));
      const invoice = await createDirectInvoice({ customerId, salesperson, currency, taxRateId: taxRateId || undefined, items });
      showSuccess("Invoice created", `${invoice.id} — items marked Sold.`);
      onOpenChange(false);
      onCreated(invoice.id);
    } catch (error: any) {
      showError("Error", error?.message || "Could not create this invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg">
        <SheetHeader>
          <SheetTitle>New invoice — direct sale</SheetTitle>
          <SheetDescription>The counter-sale path: items move straight from Available to Sold. The other way in is converting a Memo.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="mt-1">
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
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Salesperson</Label>
            <Input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} className="mt-1" />
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
          <div>
            <Label className="text-xs text-muted-foreground">Tax rate</Label>
            <Select value={taxRateId || "none"} onValueChange={(v) => setTaxRateId(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="No tax" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tax</SelectItem>
                {taxRates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label} ({t.numericValue}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Select items (Available only)</p>
          <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-md p-2">
            {eligible.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <input type="checkbox" checked={checked} onChange={() => toggleItem(item)} className="h-4 w-4" />
                  <span className="text-sm flex-1">
                    {item.code} · {item.title}
                  </span>
                  {checked && (
                    <Input
                      type="number"
                      value={prices[item.id] ?? ""}
                      onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="h-7 text-xs w-28"
                    />
                  )}
                </div>
              );
            })}
            {eligible.length === 0 && <p className="text-sm text-muted-foreground px-2 py-4 text-center">No available items right now.</p>}
          </div>
        </div>

        <div className="flex flex-col items-end text-sm gap-0.5">
          {(() => {
            const subtotal = selectedIds.reduce((sum, id) => sum + Number(prices[id] || 0), 0);
            const taxPercent = getTaxRatePercent(taxRateId || undefined);
            const tax = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
            return (
              <>
                <div>
                  <span className="text-muted-foreground mr-2">Subtotal</span>
                  <span>{formatCurrency(subtotal, currency)}</span>
                </div>
                {taxPercent > 0 && (
                  <div>
                    <span className="text-muted-foreground mr-2">Tax ({taxPercent}%)</span>
                    <span>{formatCurrency(tax, currency)}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground mr-2">Total</span>
                  <span className="font-semibold">{formatCurrency(subtotal + tax, currency)}</span>
                </div>
              </>
            );
          })()}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create invoice"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
