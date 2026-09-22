import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listInventory } from "@/lib/api/inventoryApi";
import { listCustomers } from "@/lib/api/customerApi";
import { createSalesOrder } from "@/lib/api/salesOrderApi";
import { getList } from "@/lib/store/masterDataStore";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { SalesOrderLine } from "@/types/salesOrder";
import type { Customer } from "@/types/party";
import { useEffect, useState } from "react";

interface CreateSalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateSalesOrderDialog({ open, onOpenChange, onCreated }: CreateSalesOrderDialogProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [salesperson, setSalesperson] = useState("Jordan Miller");
  const [eligible, setEligible] = useState<InventoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lineBasis, setLineBasis] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  const currencies = getList("currencies");
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
      setLineBasis({});
    }
  }, [open]);

  useEffect(() => {
    if (selectedCustomer) setCurrency(selectedCustomer.currency || "USD");
  }, [customerId, selectedCustomer]);

  const toggleItem = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (!customerId || selectedIds.length === 0) {
      showError("Missing fields", "Select a customer and at least one item.");
      return;
    }
    setSaving(true);
    try {
      const lines: Omit<SalesOrderLine, "id" | "fulfilled">[] = selectedIds.map((id) => {
        const item = eligible.find((i) => i.id === id)!;
        return { itemId: id, priceBasis: lineBasis[id] || `Our price ${formatCurrency(item.askingPrice)}`, quantity: 1, lineTotal: item.askingPrice };
      });
      const order = await createSalesOrder({ customerId, salesperson, currency, lines });
      showSuccess("Sales order created", `${order.id} — items allocated.`);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      showError("Error", error?.message || "Could not create this sales order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg">
        <SheetHeader>
          <SheetTitle>New sales order</SheetTitle>
          <SheetDescription>Selected items are allocated (Reserved) immediately — available for anyone else until fulfilled and invoiced.</SheetDescription>
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
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Select items (Available only)</p>
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
            {eligible.length === 0 && <p className="text-sm text-muted-foreground px-2 py-4 text-center">No available items right now.</p>}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create sales order"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
