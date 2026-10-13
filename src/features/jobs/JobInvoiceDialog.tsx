import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LINE_TYPE_LABEL } from "@/features/jobs/jobLabels";
import { listJobOrders } from "@/lib/api/jobOrderApi";
import { createJobInvoice, DuplicateInvoiceError, listPurchaseOrders, updateJobInvoice, type JobInvoicePayload } from "@/lib/api/purchaseOrderApi";
import { getJobSettings } from "@/lib/api/settingsApi";
import { createVendor, listVendors } from "@/lib/api/vendorApi";
import { chargesTotal, findDuplicateInvoice, landedLineCost, lineValue } from "@/lib/job/costing";
import { getList } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import { COST_BUCKET_LABELS, COST_BUCKETS, type CostBucket, type JobOrder } from "@/types/jobOrder";
import type { Vendor } from "@/types/party";
import { PURCHASE_UNITS, type PurchaseCharges, type PurchaseOrder, type PurchaseOrderLine, type PurchaseOrderLineType, type PurchaseUnit } from "@/types/purchaseOrder";
import { AlertTriangle, Check, Plus, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface JobInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (order: PurchaseOrder) => void;
  /** Edits this document when set. */
  editOrder?: PurchaseOrder | null;
  /** New lines charge to this job unless changed. */
  defaultJobId?: string;
}

const STOCK = "__stock__";

interface LineDraft {
  key: string;
  id?: string;
  description: string;
  lineType: PurchaseOrderLineType;
  bucket: CostBucket;
  category: string;
  unit: PurchaseUnit;
  qty: string;
  price: string;
  /** A job id, or STOCK. */
  goesTo: string;
}

type ChargeDrafts = Record<keyof PurchaseCharges, string>;

const CHARGE_FIELDS: { key: keyof PurchaseCharges; label: string }[] = [
  { key: "shipping", label: "Shipping" },
  { key: "insurance", label: "Insurance" },
  { key: "duty", label: "Customs / duty" },
  { key: "other", label: "Other charges" },
  { key: "discount", label: "Discount" },
];

const DEFAULT_BUCKET: Record<PurchaseOrderLineType, CostBucket> = { Goods: "Stones", Metal: "Metal", Service: "Labour" };
const DEFAULT_UNIT: Record<PurchaseOrderLineType, PurchaseUnit> = { Goods: "pcs", Metal: "g", Service: "pcs" };

const today = () => new Date().toISOString().slice(0, 10);
const num = (text: string) => {
  const value = Number(text);
  return text.trim() === "" || Number.isNaN(value) ? 0 : value;
};
const toText = (value: number) => (value ? String(value) : "");

const emptyLine = (goesTo: string): LineDraft => ({
  key: crypto.randomUUID(),
  description: "",
  lineType: "Service",
  bucket: "Labour",
  category: "Diamond",
  unit: "pcs",
  qty: "1",
  price: "",
  goesTo,
});

const lineFromOrder = (line: PurchaseOrderLine): LineDraft => ({
  key: line.id,
  id: line.id,
  description: line.description,
  lineType: line.lineType,
  bucket: line.bucket ?? DEFAULT_BUCKET[line.lineType],
  category: line.category ?? "Diamond",
  unit: line.unit,
  qty: String(line.expectedQty),
  price: String(line.expectedCost),
  goesTo: line.destination.kind === "Job" ? line.destination.jobId : STOCK,
});

/** The label wraps its control, so the control is named by it without threading ids through every field. */
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="block font-normal">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="mt-1">{children}</div>
      </Label>
    </div>
  );
}

/**
 * Enter a vendor invoice or credit note against job orders. Saved as a purchase order, so it also shows
 * in the Purchase Orders list. Each line chooses where it goes: a job (any open one — one invoice can
 * cover several) or stock, received later through the normal Receive dialog.
 */
export function JobInvoiceDialog({ open, onOpenChange, onSaved, editOrder, defaultJobId }: JobInvoiceDialogProps) {
  const isEditing = Boolean(editOrder);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);

  const [documentType, setDocumentType] = useState<JobInvoicePayload["documentType"]>("VendorInvoice");
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [currency, setCurrency] = useState("USD");
  const [creditForPoId, setCreditForPoId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [charges, setCharges] = useState<ChargeDrafts>({ shipping: "", insurance: "", duty: "", other: "", discount: "" });
  const [taxAmount, setTaxAmount] = useState("");
  const [taxRecoverable, setTaxRecoverable] = useState(true);
  const [paperTotal, setPaperTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", taxId: "", email: "", phone: "" });

  const currencies = getList("currencies");
  const firstJobId = defaultJobId ?? "";

  useEffect(() => {
    if (!open) return;
    listVendors().then(setVendors);
    listJobOrders().then(setJobs);
    listPurchaseOrders().then(setOrders);
    setAddingVendor(false);
    setNewVendor({ name: "", taxId: "", email: "", phone: "" });
    setPaperTotal("");
    if (editOrder) {
      setDocumentType(editOrder.documentType === "CreditNote" ? "CreditNote" : "VendorInvoice");
      setVendorId(editOrder.vendorId);
      setInvoiceNumber(editOrder.vendorInvoiceNumber ?? "");
      setInvoiceDate(editOrder.vendorInvoiceDate ?? editOrder.issuedAt);
      setCurrency(editOrder.currency);
      setCreditForPoId(editOrder.creditForPoId ?? "");
      setLines(editOrder.lines.map(lineFromOrder));
      setCharges({
        shipping: toText(editOrder.charges.shipping),
        insurance: toText(editOrder.charges.insurance),
        duty: toText(editOrder.charges.duty),
        other: toText(editOrder.charges.other),
        discount: toText(editOrder.charges.discount),
      });
      setTaxAmount(toText(editOrder.tax.amount));
      setTaxRecoverable(editOrder.tax.recoverable);
      setNotes(editOrder.notes);
    } else {
      setDocumentType("VendorInvoice");
      setVendorId("");
      setInvoiceNumber("");
      setInvoiceDate(today());
      setCurrency("USD");
      setCreditForPoId("");
      setLines([emptyLine(firstJobId || STOCK)]);
      setCharges({ shipping: "", insurance: "", duty: "", other: "", discount: "" });
      setTaxAmount("");
      setNotes("");
      getJobSettings().then((s) => setTaxRecoverable(s.purchaseTaxRecoverable));
    }
  }, [open, editOrder, firstJobId]);

  const vendor = vendors.find((v) => v.id === vendorId);

  const chooseVendor = (id: string) => {
    setVendorId(id);
    const chosen = vendors.find((v) => v.id === id);
    if (chosen?.currency && !isEditing) setCurrency(chosen.currency);
  };

  const handleCreateVendor = async () => {
    if (!newVendor.name.trim()) {
      showError("Missing name", "Enter the vendor's name.");
      return;
    }
    const created = await createVendor({
      name: newVendor.name.trim(),
      taxId: newVendor.taxId.trim(),
      email: newVendor.email.trim(),
      phone: newVendor.phone.trim(),
      contact: "",
      address: "",
      paymentTerms: "Net 30",
      currency,
      notes: "",
    });
    setVendors((list) => [...list, created]);
    setVendorId(created.id);
    setAddingVendor(false);
    showSuccess("Vendor added", `${created.name} (${created.id}) added.`);
  };

  // Jobs a line can go to: every job that isn't cancelled, plus any cancelled job a saved line already points at.
  const selectableJobs = jobs.filter((job) => job.status !== "Cancelled" || lines.some((l) => l.goesTo === job.id));

  const updateLine = (key: string, patch: Partial<LineDraft>) => setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const changeLineType = (row: LineDraft, lineType: PurchaseOrderLineType) => updateLine(row.key, { lineType, bucket: DEFAULT_BUCKET[lineType], unit: DEFAULT_UNIT[lineType] });

  /* ------------------------------------------------------------ the document as it would be saved */

  const payload: JobInvoicePayload = {
    documentType,
    vendorId,
    vendorInvoiceNumber: invoiceNumber,
    vendorInvoiceDate: invoiceDate,
    creditForPoId: documentType === "CreditNote" ? creditForPoId || undefined : undefined,
    currency,
    charges: {
      shipping: num(charges.shipping),
      insurance: num(charges.insurance),
      duty: num(charges.duty),
      other: num(charges.other),
      discount: num(charges.discount),
    },
    tax: { amount: num(taxAmount), recoverable: taxRecoverable },
    notes,
    lines: lines.map((row) => ({
      id: row.id,
      description: row.description,
      lineType: row.lineType,
      bucket: row.goesTo === STOCK ? undefined : row.bucket,
      category: row.goesTo === STOCK ? row.category : undefined,
      unit: row.unit,
      expectedQty: num(row.qty),
      expectedCost: num(row.price),
      destination: row.goesTo === STOCK ? { kind: "Stock" } : { kind: "Job", jobId: row.goesTo },
    })),
  };

  const preview = useMemo(() => {
    const asOrder = { lines: payload.lines.map((l, index) => ({ ...l, id: String(index), receivedQty: 0, receivedItemIds: [] })) as PurchaseOrderLine[], charges: payload.charges, tax: payload.tax };
    const subtotal = asOrder.lines.reduce((sum, line) => sum + lineValue(line), 0);
    const total = subtotal + chargesTotal(payload.charges) + payload.tax.amount;
    const byDestination = new Map<string, number>();
    for (const line of asOrder.lines) {
      const key = line.destination.kind === "Job" ? line.destination.jobId : STOCK;
      byDestination.set(key, (byDestination.get(key) ?? 0) + landedLineCost(asOrder, line));
    }
    return { subtotal, total, byDestination };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(payload)]);

  const duplicate = vendorId && invoiceNumber.trim() ? findDuplicateInvoice(orders, payload, editOrder?.id) : undefined;
  const paperDiff = paperTotal.trim() ? num(paperTotal) - preview.total : 0;
  const creditCandidates = orders.filter((o) => o.vendorId === vendorId && o.documentType === "VendorInvoice" && o.id !== editOrder?.id);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = isEditing && editOrder ? await updateJobInvoice(editOrder.id, payload) : await createJobInvoice(payload);
      if (saved) {
        const label = documentType === "CreditNote" ? "Credit note" : "Invoice";
        showSuccess(isEditing ? "Saved" : `${label} added`, `${label} ${saved.vendorInvoiceNumber} saved as ${saved.id}.`);
        onOpenChange(false);
        onSaved(saved);
      }
    } catch (error: any) {
      showError(error instanceof DuplicateInvoiceError ? "Already entered" : "Could not save", error?.message || "Could not save this document.");
    } finally {
      setSaving(false);
    }
  };

  const jobLabel = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    return job ? `${job.id} · ${job.title}` : id;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg" className="p-0 gap-0 h-full flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">
            {isEditing ? `Edit ${editOrder?.id} — ${editOrder?.documentType === "CreditNote" ? "credit note" : "invoice"} ${editOrder?.vendorInvoiceNumber ?? ""}` : defaultJobId ? `Add invoice to ${defaultJobId}` : "Add vendor invoice"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Enter it as printed. It is saved as a purchase order, so it also appears in the Purchase Orders list.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Document header */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Document</span>
              <div role="group" aria-label="Document" className="mt-1 inline-flex rounded-md border p-0.5 w-full">
                {(["VendorInvoice", "CreditNote"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDocumentType(option)}
                    aria-pressed={documentType === option}
                    className={cn("flex-1 rounded px-2 py-1.5 text-xs", documentType === option ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    {option === "VendorInvoice" ? "Invoice" : "Credit note"}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Vendor *" className="col-span-2">
              <div className="flex gap-2">
                <Select value={vendorId} onValueChange={chooseVendor}>
                  <SelectTrigger aria-label="Vendor">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.taxId ? ` · ${v.taxId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setAddingVendor((v) => !v)} title="New vendor">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <Field label="Currency">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.label}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {addingVendor && (
              <div className="col-span-4 rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium mb-2">New vendor</p>
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-2 items-end">
                  <Field label="Name *">
                    <Input value={newVendor.name} onChange={(e) => setNewVendor((v) => ({ ...v, name: e.target.value }))} />
                  </Field>
                  <Field label="Tax ID">
                    <Input value={newVendor.taxId} onChange={(e) => setNewVendor((v) => ({ ...v, taxId: e.target.value }))} />
                  </Field>
                  <Field label="Email">
                    <Input value={newVendor.email} onChange={(e) => setNewVendor((v) => ({ ...v, email: e.target.value }))} />
                  </Field>
                  <Field label="Phone">
                    <Input value={newVendor.phone} onChange={(e) => setNewVendor((v) => ({ ...v, phone: e.target.value }))} />
                  </Field>
                  <Button type="button" onClick={handleCreateVendor}>
                    Add vendor
                  </Button>
                </div>
              </div>
            )}

            <Field label={`${documentType === "CreditNote" ? "Credit note" : "Invoice"} number *`}>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={cn(duplicate && "border-destructive")} aria-label="Invoice number" />
            </Field>
            <Field label="Date *">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
            {documentType === "CreditNote" ? (
              <Field label="Reverses invoice" className="col-span-2">
                <Select value={creditForPoId || "none"} onValueChange={(v) => setCreditForPoId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {creditCandidates.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.vendorInvoiceNumber} · {o.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div className="col-span-2 text-xs text-muted-foreground self-end pb-2">{vendor ? `${vendor.name}${vendor.taxId ? ` · Tax ID ${vendor.taxId}` : ""}` : ""}</div>
            )}
            {duplicate && (
              <div className="col-span-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span>
                  {documentType === "CreditNote" ? "Credit note" : "Invoice"} {duplicate.vendorInvoiceNumber} from this vendor is already entered as{" "}
                  <Link to={`/purchase-orders/${duplicate.id}`} className="underline font-medium" onClick={() => onOpenChange(false)}>
                    {duplicate.id}
                  </Link>
                  . Entering it again would double the cost.
                </span>
              </div>
            )}
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">Lines</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((rows) => [...rows, emptyLine(rows[rows.length - 1]?.goesTo ?? (firstJobId || STOCK))])} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1.6fr)_96px_128px_72px_72px_96px_170px_92px_28px] gap-1.5 px-1 text-[11px] text-muted-foreground">
              <span>Description</span>
              <span>Type</span>
              <span>Cost type</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Price ea.</span>
              <span>Goes to</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <div className="space-y-1.5 mt-1">
              {lines.map((row) => {
                const toStock = row.goesTo === STOCK;
                return (
                  <div key={row.key} className="grid grid-cols-[minmax(0,1.6fr)_96px_128px_72px_72px_96px_170px_92px_28px] gap-1.5 items-center">
                    <Input value={row.description} onChange={(e) => updateLine(row.key, { description: e.target.value })} placeholder="e.g. 18K gold casting" className="h-8 text-sm" />
                    <Select value={row.lineType} onValueChange={(v) => changeLineType(row, v as PurchaseOrderLineType)}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Line type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(LINE_TYPE_LABEL) as PurchaseOrderLineType[]).map((t) => (
                          <SelectItem key={t} value={t}>
                            {LINE_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {toStock ? (
                      <Select value={row.category} onValueChange={(v) => updateLine(row.key, { category: v })}>
                        <SelectTrigger className="h-8 text-xs" title="Inventory category it will be received as" aria-label="Inventory category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Diamond">Diamond</SelectItem>
                          <SelectItem value="Jewelry">Jewelry</SelectItem>
                          <SelectItem value="Watch">Watch</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={row.bucket} onValueChange={(v) => updateLine(row.key, { bucket: v as CostBucket })}>
                        <SelectTrigger className="h-8 text-xs" aria-label="Cost type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COST_BUCKETS.filter((b) => b !== "Overhead").map((b) => (
                            <SelectItem key={b} value={b}>
                              {COST_BUCKET_LABELS[b]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input inputMode="decimal" value={row.qty} onChange={(e) => updateLine(row.key, { qty: e.target.value })} className="h-8 text-sm tabular-nums" aria-label="Quantity" />
                    <Select value={row.unit} onValueChange={(v) => updateLine(row.key, { unit: v as PurchaseUnit })}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PURCHASE_UNITS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input inputMode="decimal" value={row.price} onChange={(e) => updateLine(row.key, { price: e.target.value })} className="h-8 text-sm tabular-nums" aria-label="Price each" />
                    <Select value={row.goesTo} onValueChange={(v) => updateLine(row.key, { goesTo: v })}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Goes to">
                        <SelectValue>{toStock ? "Stock (receive later)" : row.goesTo}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {selectableJobs.map((job) => (
                          <SelectItem key={job.id} value={job.id}>
                            {jobLabel(job.id)}
                          </SelectItem>
                        ))}
                        <SelectItem value={STOCK}>Stock — receive into inventory</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-right text-sm tabular-nums">{formatCurrency(num(row.qty) * num(row.price), currency)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== row.key) : rows))}
                      className="h-8 w-8"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charges, tax, totals */}
          <div className="grid grid-cols-[1fr_300px] gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {CHARGE_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label}>
                    <Input inputMode="decimal" value={charges[field.key]} onChange={(e) => setCharges((c) => ({ ...c, [field.key]: e.target.value }))} className="h-8 text-sm tabular-nums" aria-label={field.label} />
                  </Field>
                ))}
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Charges are spread across the lines by value, so each job carries its share of the freight and duty.</p>
              <div className="grid grid-cols-5 gap-2 items-end">
                <Field label="Tax (GST / VAT)">
                  <Input inputMode="decimal" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="h-8 text-sm tabular-nums" />
                </Field>
                <div className="col-span-4 flex items-center gap-2 pb-1.5">
                  <Switch checked={taxRecoverable} onCheckedChange={setTaxRecoverable} id="tax-recoverable" />
                  <Label htmlFor="tax-recoverable" className="text-sm font-normal">
                    Tax can be claimed back — keep it off product cost
                  </Label>
                </div>
              </div>
              <Field label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </Field>
            </div>

            <div className="rounded-md border p-4 space-y-1.5 text-sm self-start">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lines</span>
                <span className="tabular-nums">{formatCurrency(preview.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Charges</span>
                <span className="tabular-nums">{formatCurrency(chargesTotal(payload.charges), currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatCurrency(payload.tax.amount, currency)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-semibold">
                <span>{documentType === "CreditNote" ? "Credit total" : "Invoice total"}</span>
                <span className="tabular-nums">{formatCurrency(preview.total, currency)}</span>
              </div>
              <div className="pt-2">
                <Label className="text-xs text-muted-foreground">Total printed on the paper (optional check)</Label>
                <Input inputMode="decimal" value={paperTotal} onChange={(e) => setPaperTotal(e.target.value)} className="h-8 mt-1 text-sm tabular-nums" />
                {paperTotal.trim() &&
                  (Math.abs(paperDiff) < 0.01 ? (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Matches
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Differs by {formatCurrency(paperDiff, currency)}
                    </p>
                  ))}
              </div>
              <div className="border-t pt-2 mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">Cost going to{documentType === "CreditNote" ? " (reduces)" : ""}</p>
                {[...preview.byDestination.entries()].map(([key, amount]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="truncate mr-2">{key === STOCK ? "Stock" : key}</span>
                    <span className="tabular-nums">{formatCurrency(amount, currency)}</span>
                  </div>
                ))}
                {!taxRecoverable && payload.tax.amount > 0 && <p className="text-[11px] text-muted-foreground">Includes tax, spread by value.</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || Boolean(duplicate)}>
            {saving ? "Saving…" : isEditing ? "Save changes" : `Save ${documentType === "CreditNote" ? "credit note" : "invoice"}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
