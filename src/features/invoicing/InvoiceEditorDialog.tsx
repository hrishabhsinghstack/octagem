import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers } from "@/lib/api/customerApi";
import { listInventory } from "@/lib/api/inventoryApi";
import { createInvoice, issueInvoice, listInvoices, updateDraftInvoice, type InvoiceLineInput, type InvoicePayload } from "@/lib/api/invoiceApi";
import { getTaxRatePercent } from "@/lib/currency";
import { draftItemConflicts, invoiceTotals, lineTotal } from "@/lib/invoice";
import { getList } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { Invoice } from "@/types/invoice";
import type { Customer } from "@/types/party";
import { AlertTriangle, Gem, Plus, Trash2, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * A line while it is being edited. Quantity and price stay strings so a half-typed "1." or "" behaves
 * like every other form in this codebase — they are coerced once, on save.
 */
interface DraftLine {
  key: string;
  /** Present on a stock line, absent on a free-text charge. The two render differently but total identically. */
  itemId?: string;
  /** Kept for the stock picker and the conflict warning; not persisted. */
  itemCode?: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface InvoiceEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, edits this draft instead of creating. Non-drafts are rejected by the API. */
  editInvoice?: Invoice | null;
  onSaved: (invoiceId: string) => void;
}

const newKey = () => crypto.randomUUID();

const freshLine = (): DraftLine => ({ key: newKey(), description: "", quantity: "1", unitPrice: "" });

const num = (raw: string) => {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
};

export function InvoiceEditorDialog({ open, onOpenChange, editInvoice, onSaved }: InvoiceEditorDialogProps) {
  const isEditing = Boolean(editInvoice);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [available, setAvailable] = useState<InventoryItem[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [salesperson, setSalesperson] = useState("Jordan Miller");
  const [currency, setCurrency] = useState("USD");
  const [taxRateId, setTaxRateId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const currencies = getList("currencies");
  const taxRates = getList("taxRates");
  const selectedCustomer = customers.find((c) => c.id === customerId);

  /* ------------------------------------------------------------ open / reset */

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    Promise.all([listCustomers(), listInventory(), listInvoices()]).then(([customerList, items, invoices]) => {
      if (cancelled) return;
      setCustomers(customerList);
      setAllInvoices(invoices);
      // Items already on the draft stay pickable even though issuing moved them — on a draft nothing moved.
      const onThisDraft = new Set(editInvoice?.lines.map((l) => l.itemId).filter(Boolean) ?? []);
      setAvailable(items.filter((item) => item.status === "Available" || onThisDraft.has(item.id)));
    });

    setSubmitAttempted(false);
    setPickerOpen(false);

    if (editInvoice) {
      setCustomerId(editInvoice.customerId);
      setSalesperson(editInvoice.salesperson);
      setCurrency(editInvoice.currency);
      setTaxRateId(editInvoice.taxRateId ?? "");
      setDueDate(editInvoice.dueDate);
      setNotes(editInvoice.notes ?? "");
      setDiscount(editInvoice.discount ? String(editInvoice.discount) : "");
      setShipping(editInvoice.shipping ? String(editInvoice.shipping) : "");
      setLines(
        editInvoice.lines.map((line) => ({
          key: line.id,
          itemId: line.itemId,
          description: line.description,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
        }))
      );
    } else {
      setCustomerId("");
      setSalesperson("Jordan Miller");
      setCurrency("USD");
      setTaxRateId("");
      setDueDate(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
      setNotes("");
      setDiscount("");
      setShipping("");
      setLines([]);
    }

    return () => {
      cancelled = true;
    };
  }, [open, editInvoice]);

  // A new invoice inherits the customer's currency and tax rate; an existing draft keeps what it was saved with.
  useEffect(() => {
    if (isEditing || !selectedCustomer) return;
    setCurrency(selectedCustomer.currency || "USD");
    setTaxRateId(selectedCustomer.taxRateId ?? "");
  }, [isEditing, selectedCustomer]);

  /* ------------------------------------------------------------ derived */

  const payloadLines: InvoiceLineInput[] = useMemo(
    () =>
      lines.map((line) => ({
        itemId: line.itemId,
        description: line.description.trim(),
        quantity: num(line.quantity),
        unitPrice: num(line.unitPrice),
      })),
    [lines]
  );

  const amounts = useMemo(
    () =>
      invoiceTotals(
        payloadLines.map((line) => ({ lineTotal: lineTotal(line.quantity, line.unitPrice) })),
        { taxPercent: getTaxRatePercent(taxRateId || undefined), discount: num(discount), shipping: num(shipping) }
      ),
    [payloadLines, taxRateId, discount, shipping]
  );

  /** Other drafts claiming the same stones. Non-blocking — whichever issues first legitimately wins. */
  const conflicts = useMemo(
    () => draftItemConflicts({ id: editInvoice?.id ?? "__new__", lines: payloadLines.map((l, i) => ({ ...l, id: String(i), lineTotal: 0 })) }, allInvoices),
    [payloadLines, allInvoices, editInvoice?.id]
  );

  const lineErrors = useMemo(
    () =>
      lines.map((line) => {
        if (!line.description.trim()) return "A description is required";
        if (num(line.quantity) <= 0) return "Quantity must be more than zero";
        if (num(line.unitPrice) < 0) return "Price cannot be negative";
        return undefined;
      }),
    [lines]
  );

  const problems: string[] = [];
  if (!customerId) problems.push("Choose a customer");
  if (lines.length === 0) problems.push("Add at least one line");
  if (lineErrors.some(Boolean)) problems.push("Fix the highlighted lines");

  /* ------------------------------------------------------------ actions */

  const setLine = (key: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const addStockLine = (item: InventoryItem) => {
    setLines((current) => [
      ...current,
      { key: newKey(), itemId: item.id, itemCode: item.code, description: `${item.code} · ${item.title}`, quantity: "1", unitPrice: String(item.askingPrice) },
    ]);
    setPickerOpen(false);
  };

  const save = async (issue: boolean) => {
    setSubmitAttempted(true);
    if (problems.length > 0) {
      showError("Check the invoice", problems.join(" · "));
      return;
    }

    const payload: InvoicePayload = {
      customerId,
      salesperson,
      currency,
      taxRateId: taxRateId || undefined,
      lines: payloadLines,
      discount: num(discount),
      shipping: num(shipping),
      dueDate,
      notes: notes.trim() || undefined,
    };

    setSaving(true);
    try {
      const saved = isEditing && editInvoice ? await updateDraftInvoice(editInvoice.id, payload) : await createInvoice(payload, { issue });
      const finalId = saved.id;
      // Editing an existing draft is two steps: persist the edits, then issue what was persisted — so
      // issuing can never race ahead of a change the user just made.
      if (isEditing && issue) await issueInvoice(finalId);
      showSuccess(
        issue ? "Invoice issued" : "Draft saved",
        issue ? `${finalId} issued — the items on it are now Sold.` : `${finalId} saved. Nothing is committed until you issue it.`
      );
      onOpenChange(false);
      onSaved(finalId);
    } catch (error: any) {
      showError("Could not save", error?.message || "Could not save this invoice.");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------ render */

  const pickedIds = new Set(lines.map((l) => l.itemId).filter(Boolean));
  const pickable = available.filter((item) => !pickedIds.has(item.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg" className="p-0 gap-0 h-full flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">{isEditing ? `Edit ${editInvoice?.id}` : "New invoice"}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Save as a draft to keep working — inventory is only committed, and money only owed, once you issue it.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Customer<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className={cn(submitAttempted && !customerId && "border-destructive")}>
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
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Salesperson</Label>
              <Input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
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
            <div className="space-y-1 col-span-2">
              <Label className="text-xs text-muted-foreground">Tax rate</Label>
              <Select value={taxRateId || "none"} onValueChange={(v) => setTaxRateId(v === "none" ? "" : v)}>
                <SelectTrigger>
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

          {/* Lines */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Lines</h3>
              <div className="h-px flex-1 bg-border" />
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPickerOpen((v) => !v)}>
                <Gem className="h-3 w-3 mr-1" /> Add from inventory
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLines((c) => [...c, freshLine()])}>
                <Type className="h-3 w-3 mr-1" /> Add free line
              </Button>
            </div>

            {pickerOpen && (
              <div className="rounded-md border p-2 space-y-1 max-h-48 overflow-y-auto bg-muted/20">
                {pickable.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addStockLine(item)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-background text-left"
                  >
                    <span className="truncate">
                      {item.code} · {item.title}
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0 ml-3">{formatCurrency(item.askingPrice, currency)}</span>
                  </button>
                ))}
                {pickable.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nothing else is available to sell.</p>}
              </div>
            )}

            {lines.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20 text-right">Qty</TableHead>
                    <TableHead className="w-32 text-right">Unit price</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => {
                    const error = submitAttempted ? lineErrors[index] : undefined;
                    return (
                      <TableRow key={line.key} className="align-top">
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <span className="mt-2.5 shrink-0" title={line.itemId ? "From inventory" : "Free-text charge"}>
                              {line.itemId ? <Gem className="h-3.5 w-3.5 text-muted-foreground" /> : <Type className="h-3.5 w-3.5 text-muted-foreground" />}
                            </span>
                            <div className="flex-1 space-y-1">
                              <Input
                                value={line.description}
                                onChange={(e) => setLine(line.key, { description: e.target.value })}
                                placeholder={line.itemId ? "Item description" : "e.g. Resizing, setting labour, freight"}
                                className={cn("h-9", error && "border-destructive")}
                              />
                              {error && <p className="text-xs text-destructive">{error}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                            className="h-9 text-right tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                            className="h-9 text-right tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums pt-4">{formatCurrency(lineTotal(num(line.quantity), num(line.unitPrice)), currency)}</TableCell>
                        <TableCell className="pt-3">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(line.key)} aria-label="Remove line">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className={cn("rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground", submitAttempted && "border-destructive")}>
                <Plus className="h-4 w-4 mx-auto mb-1.5" />
                Add a stock item, or a free line for anything not in inventory — a repair, labour, freight.
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  {conflicts.map((c) => (
                    <span key={`${c.invoiceId}-${c.itemId}`} className="block">
                      <span className="font-medium text-foreground">{c.itemId}</span> is also on draft {c.invoiceId}.
                    </span>
                  ))}
                  <span className="block mt-1">Whichever draft is issued first takes the stock — this is a heads-up, not a block.</span>
                </p>
              </div>
            )}
          </section>

          {/* Charges + totals */}
          <section className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Discount</Label>
                  <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="tabular-nums" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Shipping</Label>
                  <Input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" className="tabular-nums" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes / terms</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. warranty, appraisal, payment terms" />
                {/* Stated because these reach the customer twice over — not a place for internal reminders. */}
                <p className="text-xs text-muted-foreground">Printed on the invoice and included in the covering email.</p>
              </div>
            </div>

            <div className="space-y-1.5 text-sm rounded-lg border p-4 bg-muted/20 self-start">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(amounts.subtotal, currency)}</span>
              </div>
              {amounts.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="tabular-nums">−{formatCurrency(amounts.discount, currency)}</span>
                </div>
              )}
              {amounts.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="tabular-nums">{formatCurrency(amounts.tax, currency)}</span>
                </div>
              )}
              {amounts.shipping > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="tabular-nums">{formatCurrency(amounts.shipping, currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-1.5">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(amounts.total, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {lines.filter((l) => l.itemId).length} stock · {lines.filter((l) => !l.itemId).length} free
              </p>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {submitAttempted && problems.length > 0 && (
              <Badge variant="outline" className="text-destructive border-destructive/40 font-normal mr-1">
                {problems[0]}
              </Badge>
            )}
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              {isEditing ? "Save draft" : "Save as draft"}
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              {saving ? "Saving…" : "Save & issue"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
