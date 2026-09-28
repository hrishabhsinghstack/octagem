import { CATEGORY_ICONS } from "@/components/catalog/categoryIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createCategory, updateCategory } from "@/lib/api/catalogApi";
import { formatStockNumber } from "@/lib/inventory/stockNumber";
import { cn, showError, showSuccess } from "@/lib/utils";
import type { CategoryDefinition, WeightUnit } from "@/types/catalog";
import type { IdentityModel } from "@/types/inventory";
import { useEffect, useState } from "react";

interface CategoryEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this category; omit to create one. */
  category?: CategoryDefinition | null;
  onSaved: () => void;
}

const IDENTITY_MODELS: { value: IdentityModel; label: string; hint: string }[] = [
  { value: "UNIQUE", label: "Unique", hint: "Each piece is one of a kind — a certified stone, a watch." },
  { value: "LOT", label: "Lot / parcel", hint: "Sold by weight from a mixed parcel — melee, calibrated stones." },
  { value: "QUANTITY", label: "Quantity", hint: "Identical pieces counted — a repeated design, coins." },
];

const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: "ct", label: "Carats (ct)" },
  { value: "g", label: "Grams (g)" },
  { value: "none", label: "Not weighed" },
];

export function CategoryEditorDialog({ open, onOpenChange, category, onSaved }: CategoryEditorDialogProps) {
  const isEditing = Boolean(category);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("package");
  const [stockPrefix, setStockPrefix] = useState("");
  const [stockStartNumber, setStockStartNumber] = useState("1");
  const [stockPadding, setStockPadding] = useState("0");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("g");
  const [allowed, setAllowed] = useState<IdentityModel[]>(["UNIQUE"]);
  const [defaultModel, setDefaultModel] = useState<IdentityModel>("UNIQUE");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(category?.label ?? "");
    setIcon(category?.icon ?? "package");
    setStockPrefix(category?.stockPrefix ?? "");
    setStockStartNumber(String(category?.stockStartNumber ?? 1));
    setStockPadding(String(category?.stockPadding ?? 0));
    setWeightUnit(category?.weightUnit ?? "g");
    setAllowed(category?.allowedIdentityModels ?? ["UNIQUE"]);
    setDefaultModel(category?.defaultIdentityModel ?? "UNIQUE");
  }, [open, category]);

  const toggleModel = (model: IdentityModel) => {
    const next = allowed.includes(model) ? allowed.filter((m) => m !== model) : [...allowed, model];
    if (next.length === 0) return; // a category must allow at least one way of counting stock
    setAllowed(next);
    if (!next.includes(defaultModel)) setDefaultModel(next[0]);
  };

  const start = Math.max(0, Math.floor(Number(stockStartNumber) || 0));
  const padding = Math.min(10, Math.max(0, Math.floor(Number(stockPadding) || 0)));
  const preview = stockPrefix.trim() ? formatStockNumber({ stockPrefix: stockPrefix.trim(), stockPadding: padding }, start || 1) : "—";

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = { label, icon, stockPrefix, stockStartNumber: start || 1, stockPadding: padding, weightUnit, defaultIdentityModel: defaultModel, allowedIdentityModels: allowed };
      if (isEditing && category) {
        await updateCategory(category.key, payload);
        showSuccess("Saved", `${label.trim()} updated.`);
      } else {
        await createCategory(payload);
        showSuccess("Category created", `${label.trim()} is ready to receive stock.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not save", error?.message || "Could not save this category.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit ${category?.label}` : "New category"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-[1fr_12rem] gap-3">
            <div className="space-y-1">
              <Label htmlFor="category-label" className="text-xs text-muted-foreground">
                Name<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input id="category-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Gold ornaments" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Icon</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_ICONS).map(([key, { icon: Icon, label: iconLabel }]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" /> {iconLabel}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Stock numbering</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="category-prefix" className="text-xs text-muted-foreground">
                  Prefix<span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input id="category-prefix" value={stockPrefix} onChange={(e) => setStockPrefix(e.target.value.toUpperCase())} placeholder="GO-" className="uppercase" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="category-start" className="text-xs text-muted-foreground">
                  Start at
                </Label>
                <Input id="category-start" inputMode="numeric" value={stockStartNumber} onChange={(e) => setStockStartNumber(e.target.value)} className="tabular-nums" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="category-padding" className="text-xs text-muted-foreground">
                  Minimum digits
                </Label>
                <Input id="category-padding" inputMode="numeric" value={stockPadding} onChange={(e) => setStockPadding(e.target.value)} className="tabular-nums" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              First stock number: <span className="font-medium text-foreground tabular-nums">{preview}</span> — after that it continues from the highest number in use.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">How stock is counted</p>
            <div className="space-y-2">
              {IDENTITY_MODELS.map((model) => {
                const on = allowed.includes(model.value);
                return (
                  <div key={model.value} className={cn("flex items-start gap-3 rounded-md border p-2.5", on && "border-primary/40 bg-primary/5")}>
                    <input type="checkbox" id={`model-${model.value}`} checked={on} onChange={() => toggleModel(model.value)} className="mt-0.5 h-4 w-4 accent-primary" />
                    <label htmlFor={`model-${model.value}`} className="flex-1 cursor-pointer">
                      <span className="text-sm font-medium">{model.label}</span>
                      <span className="block text-xs text-muted-foreground">{model.hint}</span>
                    </label>
                    {on && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="radio" name="default-model" checked={defaultModel === model.value} onChange={() => setDefaultModel(model.value)} className="accent-primary" /> Default
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1 max-w-xs">
            <Label className="text-xs text-muted-foreground">Weight unit</Label>
            <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as WeightUnit)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEIGHT_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create category"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
