import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { listCategories } from "@/lib/api/catalogApi";
import { listInventory } from "@/lib/api/inventoryApi";
import { addCustomerMaterial, addLeftoverToStock, consumeFromStock, returnToStock } from "@/lib/api/jobMaterialsApi";
import { outstandingFor, parcelCarats, planConsumption } from "@/lib/job/materials";
import { listLocationPaths } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { CategoryDefinition } from "@/types/catalog";
import type { InventoryItem } from "@/types/inventory";
import { COST_BUCKET_LABELS, COST_BUCKETS, type CostBucket, type CustomerMaterialKind, type JobCostEntry, type JobOrder } from "@/types/jobOrder";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);
const num = (text: string) => {
  const value = Number(text);
  return text.trim() === "" || Number.isNaN(value) ? undefined : value;
};

/** Label wrapping its control, so the control is named without threading ids. */
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

function BucketSelect({ value, onChange }: { value: CostBucket; onChange: (bucket: CostBucket) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CostBucket)}>
      <SelectTrigger aria-label="Cost type">
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
  );
}

const describeStock = (item: InventoryItem) => {
  const carats = parcelCarats(item);
  if (item.identityModel === "UNIQUE") return carats ? `${carats} ct` : "1 piece";
  return [carats !== undefined ? `${carats} ct` : "", item.quantity !== undefined ? `${item.quantity} pcs` : ""].filter(Boolean).join(" · ") || "parcel";
};

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobOrder;
  baseCurrency: string;
  showCost: boolean;
  onSaved: () => void;
}

/* ------------------------------------------------------------------ use from stock */

export function UseFromStockDialog({ open, onOpenChange, job, baseCurrency, showCost, onSaved }: BaseProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [carats, setCarats] = useState("");
  const [pieces, setPieces] = useState("");
  const [bucket, setBucket] = useState<CostBucket>("Stones");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Materials only: watches and finished one-off jewelry pieces aren't inputs (reworking a piece is a later phase).
    const isMaterial = (i: InventoryItem) => !i.watch && !(i.jewelry && i.identityModel === "UNIQUE");
    listInventory().then((all) => setItems(all.filter((i) => i.status === "Available" && i.ownership === "OWNED" && isMaterial(i))));
    setQuery("");
    setSelectedId("");
    setCarats("");
    setPieces("");
    setBucket("Stones");
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || [i.code, i.title, i.description].some((t) => t.toLowerCase().includes(q))).slice(0, 50);
  }, [items, query]);

  const selected = items.find((i) => i.id === selectedId);
  const isParcel = selected && selected.identityModel !== "UNIQUE";
  let preview: { amount?: number; error?: string } = {};
  if (selected) {
    try {
      preview = { amount: planConsumption(selected, { carats: num(carats), pieces: num(pieces) }).amount };
    } catch (error: any) {
      preview = { error: isParcel && !carats && !pieces ? undefined : error.message };
    }
  }

  const choose = (item: InventoryItem) => {
    setSelectedId(item.id);
    setCarats("");
    setPieces("");
    setBucket(item.category === "Diamond" ? "Stones" : "Findings");
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await consumeFromStock(job.id, { itemId: selected.id, bucket, carats: num(carats), pieces: num(pieces) });
      showSuccess("Added to job", `${selected.code} is now on ${job.id}.`);
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not use it", error?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Use from stock</SheetTitle>
          <p className="text-sm text-muted-foreground">Take a stone — or part of a parcel — out of inventory and onto {job.id}. Its cost moves to the job.</p>
        </SheetHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stock #, title" className="pl-8" aria-label="Search stock" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border divide-y">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choose(item)}
              className={cn("w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-muted/50", item.id === selectedId && "bg-primary/5")}
            >
              <span>
                <span className="text-sm font-medium">{item.code}</span> <span className="text-sm">{item.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.category} · {describeStock(item)} · {item.location}
                </span>
              </span>
              {showCost && <span className="text-sm tabular-nums text-muted-foreground">{formatCurrency(item.cost, baseCurrency)}</span>}
            </button>
          ))}
          {visible.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No available stock matches.</p>}
        </div>

        {selected && (
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm">
              <span className="font-medium">{selected.code}</span> — {selected.title} <span className="text-muted-foreground">({describeStock(selected)})</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              {isParcel && (
                <>
                  <Field label="Carats to take">
                    <Input inputMode="decimal" value={carats} onChange={(e) => setCarats(e.target.value)} disabled={parcelCarats(selected) === undefined} />
                  </Field>
                  <Field label="Pieces to take">
                    <Input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} disabled={selected.quantity === undefined} />
                  </Field>
                </>
              )}
              <Field label="Cost type" className={isParcel ? "" : "col-span-2"}>
                <BucketSelect value={bucket} onChange={setBucket} />
              </Field>
            </div>
            {preview.error && <p className="text-xs text-destructive">{preview.error}</p>}
            {showCost && preview.amount !== undefined && (
              <p className="text-sm">
                Cost moving to the job: <span className="font-semibold tabular-nums">{formatCurrency(preview.amount, baseCurrency)}</span>
                {isParcel && parcelCarats(selected) && num(carats) ? <span className="text-muted-foreground"> — priced by the carat</span> : null}
              </p>
            )}
          </div>
        )}

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selected || saving || preview.amount === undefined}>
            {saving ? "Adding…" : "Use on this job"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ return to stock */

export function ReturnMaterialDialog({ open, onOpenChange, job, baseCurrency, showCost, onSaved, entry }: BaseProps & { entry: JobCostEntry | null }) {
  const [carats, setCarats] = useState("");
  const [pieces, setPieces] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCarats("");
      setPieces("");
    }
  }, [open]);

  if (!entry) return null;
  const left = outstandingFor(job, entry);
  const isParcel = Boolean(entry.quantity);

  const handleSave = async () => {
    setSaving(true);
    try {
      await returnToStock(job.id, entry.id, { carats: num(carats), pieces: num(pieces) });
      showSuccess("Returned to stock", `${entry.inventoryItemId} updated.`);
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not return it", error?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="default">
        <SheetHeader>
          <SheetTitle>Return to stock</SheetTitle>
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        </SheetHeader>
        <div className="space-y-4">
          <p className="text-sm">
            Still on the job:{" "}
            <span className="font-medium">
              {isParcel ? [left.carats ? `${left.carats} ct` : "", left.pieces ? `${left.pieces} pcs` : ""].filter(Boolean).join(" · ") : "the whole stone"}
            </span>
            {showCost && <span className="text-muted-foreground"> ({formatCurrency(left.amount, baseCurrency)})</span>}
          </p>
          {isParcel ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Carats going back">
                  <Input inputMode="decimal" value={carats} onChange={(e) => setCarats(e.target.value)} disabled={!entry.quantity?.carats} />
                </Field>
                <Field label="Pieces going back">
                  <Input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} disabled={!entry.quantity?.pieces} />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">Leave both blank to return everything still on the job. Returned at the rate it was taken.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{entry.inventoryItemId} goes back to Available and its cost comes off the job.</p>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Returning…" : "Return to stock"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ leftover bought on the job */

export function LeftoverDialog({ open, onOpenChange, job, baseCurrency, onSaved }: BaseProps) {
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [category, setCategory] = useState("Diamond");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [carats, setCarats] = useState("");
  const [pieces, setPieces] = useState("");
  const [amount, setAmount] = useState("");
  const [shape, setShape] = useState("Round");
  const [color, setColor] = useState("");
  const [clarity, setClarity] = useState("");
  const [location, setLocation] = useState("");
  const [bucket, setBucket] = useState<CostBucket>("Stones");
  const [saving, setSaving] = useState(false);
  const locations = useMemo(() => listLocationPaths().map((l) => l.path), [open]);

  useEffect(() => {
    if (!open) return;
    // Only categories that can hold a parcel and need no typed jewelry/watch block.
    listCategories().then((all) => setCategories(all.filter((c) => c.allowedIdentityModels.includes("LOT") && (c.key === "Diamond" || !c.builtIn))));
    setCategory("Diamond");
    setTitle("");
    setDescription("");
    setCarats("");
    setPieces("");
    setAmount("");
    setColor("");
    setClarity("");
    setBucket("Stones");
    setLocation(locations.find((p) => p.toLowerCase().includes("receiving")) ?? locations[0] ?? "");
  }, [open, locations]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { item } = await addLeftoverToStock(job.id, {
        category,
        title,
        description,
        location,
        carats: num(carats),
        pieces: num(pieces),
        amountBase: num(amount) ?? 0,
        bucket,
        shape: category === "Diamond" ? shape : undefined,
        color: category === "Diamond" ? color : undefined,
        clarity: category === "Diamond" ? clarity : undefined,
      });
      showSuccess("Added to stock", `${item.code} created; its value came off ${job.id}.`);
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not add it", error?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>Leftover to stock</SheetTitle>
          <p className="text-sm text-muted-foreground">For material bought straight onto this job that wasn't all used — it becomes a new stock parcel, and its value comes off the job.</p>
        </SheetHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Category">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Parcel name *" className="col-span-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leftover melee 1.3mm" />
            </Field>
          </div>
          {category === "Diamond" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Shape">
                <Input value={shape} onChange={(e) => setShape(e.target.value)} />
              </Field>
              <Field label="Color">
                <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="G-H" />
              </Field>
              <Field label="Clarity">
                <Input value={clarity} onChange={(e) => setClarity(e.target.value)} placeholder="VS" />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Carats">
              <Input inputMode="decimal" value={carats} onChange={(e) => setCarats(e.target.value)} />
            </Field>
            <Field label="Pieces">
              <Input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} />
            </Field>
            <Field label={`Value (${baseCurrency}) *`}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Location" className="col-span-2">
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger aria-label="Location">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((path) => (
                    <SelectItem key={path} value={path}>
                      {path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Comes off cost type">
              <BucketSelect value={bucket} onChange={setBucket} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Adding…" : "Add to stock"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ customer-supplied material */

const MATERIAL_KINDS: CustomerMaterialKind[] = ["Diamond", "Gemstone", "Metal", "Other"];

export function CustomerMaterialDialog({ open, onOpenChange, job, baseCurrency, onSaved }: BaseProps) {
  const [receivedAt, setReceivedAt] = useState(today());
  const [kind, setKind] = useState<CustomerMaterialKind>("Diamond");
  const [description, setDescription] = useState("");
  const [pieces, setPieces] = useState("");
  const [carats, setCarats] = useState("");
  const [grams, setGrams] = useState("");
  const [certificate, setCertificate] = useState("");
  const [declared, setDeclared] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReceivedAt(today());
    setKind("Diamond");
    setDescription("");
    setPieces("");
    setCarats("");
    setGrams("");
    setCertificate("");
    setDeclared("");
    setNotes("");
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await addCustomerMaterial(job.id, {
        receivedAt,
        kind,
        description,
        pieces: num(pieces),
        carats: num(carats),
        grams: num(grams),
        certificateNumber: certificate.trim() || undefined,
        declaredValue: num(declared),
        notes,
      });
      showSuccess("Recorded", `Customer material added to ${job.id}.`);
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not record it", error?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>Customer's material</SheetTitle>
          <p className="text-sm text-muted-foreground">A stone or metal the customer handed over for their piece. It has no cost to the job — this records what you hold for them.</p>
        </SheetHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Received">
              <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </Field>
            <Field label="Kind">
              <Select value={kind} onValueChange={(v) => setKind(v as CustomerMaterialKind)}>
                <SelectTrigger aria-label="Kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Certificate #">
              <Input value={certificate} onChange={(e) => setCertificate(e.target.value)} />
            </Field>
          </div>
          <Field label="Description *">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Customer's own 1.02 ct oval, GIA" />
          </Field>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Pieces">
              <Input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} />
            </Field>
            <Field label="Carats">
              <Input inputMode="decimal" value={carats} onChange={(e) => setCarats(e.target.value)} />
            </Field>
            <Field label="Grams">
              <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </Field>
            <Field label={`Declared value (${baseCurrency})`}>
              <Input inputMode="decimal" value={declared} onChange={(e) => setDeclared(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Record material"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
