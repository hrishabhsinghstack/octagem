import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listInventory } from "@/lib/api/inventoryApi";
import { createQuote } from "@/lib/api/quoteApi";
import { listCustomers } from "@/lib/api/customerApi";
import { getTaxRatePercent } from "@/lib/currency";
import { getList } from "@/lib/store/masterDataStore";
import { daysFromToday } from "@/lib/memo";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { QuoteLine } from "@/types/quote";
import type { Customer } from "@/types/party";
import { useEffect, useState } from "react";

interface CreateQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateQuoteDialog({ open, onOpenChange, onCreated }: CreateQuoteDialogProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [salesperson, setSalesperson] = useState("Jordan Miller");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState(daysFromToday(14));
  const [eligible, setEligible] = useState<InventoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lineBasis, setLineBasis] = useState<Record<string, string>>({});
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
      listInventory().then((items) => setEligible(items.filter((item) => item.status === "Available" || item.status === "Reserved")));
    } else {
      setSelectedIds([]);
      setLineBasis({});
      setNotes("");
      setExpiresAt(daysFromToday(14));
    }
  }, [open]);

  useEffect(() => {
    if (selectedCustomer) {
      setCurrency(selectedCustomer.currency || "USD");
      setTaxRateId(selectedCustomer.taxRateId || "");
    }
  }, [customerId, selectedCustomer]);

  const toggleItem = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (!customerId || selectedIds.length === 0) {
      showError("Missing fields", "Select a customer and at least one item.");
      return;
    }
    setSaving(true);
    try {
      const lines: Omit<QuoteLine, "id">[] = selectedIds.map((id) => {
        const item = eligible.find((i) => i.id === id)!;
        return { itemId: id, priceBasis: lineBasis[id] || `Our price ${formatCurrency(item.askingPrice)}`, quantity: 1, lineTotal: item.askingPrice };
      });
      const quote = await createQuote({ customerId, salesperson, notes, expiresAt, currency, taxRateId: taxRateId || undefined, lines });
      showSuccess("Quote created", `${quote.id} ready to send.`);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      showError("Error", error?.message || "Could not create this quote.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg">
        <SheetHeader>
          <SheetTitle>New quote</SheetTitle>
          <SheetDescription>A quote does not reserve inventory or commit anything — it's a proposal.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-3">
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
            <Label className="text-xs text-muted-foreground">Expires</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1" />
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
          <p className="text-xs font-medium text-muted-foreground mb-2">Select items to quote</p>
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
                      placeholder="Price basis"
                      className="h-7 text-xs w-56"
                    />
                  )}
                </div>
              );
            })}
            {eligible.length === 0 && <p className="text-sm text-muted-foreground px-2 py-4 text-center">No eligible items right now.</p>}
          </div>
        </div>

        <div className="flex flex-col items-end text-sm gap-0.5">
          {(() => {
            const subtotal = selectedIds.reduce((sum, id) => sum + (eligible.find((i) => i.id === id)?.askingPrice ?? 0), 0);
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
            {saving ? "Creating…" : "Create quote"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
