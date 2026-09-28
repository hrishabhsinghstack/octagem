import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { createTenantField, updateField } from "@/lib/api/catalogApi";
import { cn, showError, showSuccess } from "@/lib/utils";
import type { CategoryDefinition, FieldDefinition, FieldSection, FieldType } from "@/types/catalog";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

interface FieldEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryDefinition[];
  /** Edit this field; omit to create a tenant field. */
  field?: FieldDefinition | null;
  /** Pre-selects the category the admin was looking at when creating. */
  defaultCategory?: string;
  onSaved: () => void;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  integer: "Whole number",
  date: "Date",
  boolean: "Yes / No",
  select: "Dropdown",
  multiselect: "Multi-select",
};

const SECTIONS: { value: FieldSection; label: string }[] = [
  { value: "specification", label: "Specification" },
  { value: "certificate", label: "Certificate" },
  { value: "pricing", label: "Pricing" },
  { value: "custom", label: "Custom fields" },
];

export function FieldEditorDialog({ open, onOpenChange, categories, field, defaultCategory, onSaved }: FieldEditorDialogProps) {
  const isEditing = Boolean(field);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [section, setSection] = useState<FieldSection>("specification");
  const [scope, setScope] = useState<string[] | "All">([]);
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [listMode, setListMode] = useState<"strict" | "open">("strict");
  const [unit, setUnit] = useState("");
  const [required, setRequired] = useState(false);
  const [unique, setUnique] = useState(false);
  const [detail, setDetail] = useState(false);
  const [help, setHelp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? "");
    setType(field?.type ?? "text");
    setSection(field?.section ?? "specification");
    setScope(field?.categories ?? (defaultCategory ? [defaultCategory] : "All"));
    setOptions(field?.source?.kind === "options" ? field.source.values : []);
    setNewOption("");
    setListMode(field?.listMode ?? "strict");
    setUnit(field?.unit ?? "");
    setRequired(field?.required ?? false);
    setUnique(Boolean(field?.unique));
    setDetail(field?.tier === "detail");
    setHelp(field?.help ?? "");
  }, [open, field, defaultCategory]);

  const isChoice = type === "select" || type === "multiselect";
  const isNumeric = type === "number" || type === "integer";
  /** Built-in and legacy fields keep their type and scope — only presentation and rules are tenant-editable. */
  const structureLocked = isEditing && field?.origin !== "tenant";

  const addOption = () => {
    const value = newOption.trim();
    if (value && !options.some((o) => o.toLowerCase() === value.toLowerCase())) setOptions([...options, value]);
    setNewOption("");
  };

  const toggleCategory = (key: string) => {
    const current = scope === "All" ? [] : scope;
    setScope(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (isEditing && field) {
        await updateField(field.key, {
          label,
          required,
          tier: detail ? "detail" : "essential",
          ...(field.type === "select" && field.origin !== "customField" && { listMode }),
        });
        showSuccess("Saved", `${label.trim()} updated.`);
      } else {
        if (isChoice && options.length === 0) throw new Error("Add at least one value to the list.");
        const created = await createTenantField({
          label,
          type,
          section,
          categories: scope,
          source: isChoice ? { kind: "options", values: options } : undefined,
          required,
          unique: type === "text" && unique ? "live" : undefined,
          unit: isNumeric && unit.trim() ? unit.trim() : undefined,
          help: help.trim() || undefined,
        });
        if (detail || (isChoice && listMode === "open")) await updateField(created.key, { tier: detail ? "detail" : "essential", ...(isChoice && { listMode }) });
        showSuccess("Field created", `${label.trim()} now appears on the receive form and in import templates.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not save", error?.message || "Could not save this field.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit ${field?.label}` : "New field"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="field-label" className="text-xs text-muted-foreground">
                Name<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input id="field-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pearl lustre" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as FieldType)} disabled={isEditing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!structureLocked && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Form section</Label>
                <Select value={section} onValueChange={(v) => setSection(v as FieldSection)} disabled={isEditing}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isNumeric && (
                <div className="space-y-1">
                  <Label htmlFor="field-unit" className="text-xs text-muted-foreground">
                    Unit
                  </Label>
                  <Input id="field-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, ct, mm, %" disabled={isEditing} />
                </div>
              )}
            </div>
          )}

          {!isEditing && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Applies to</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={scope === "All"}
                  onClick={() => setScope(scope === "All" ? [] : "All")}
                  className={cn("px-2.5 py-1 rounded-full text-xs border", scope === "All" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
                >
                  All categories
                </button>
                {categories.map((c) => {
                  const on = scope !== "All" && scope.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={on}
                      disabled={scope === "All"}
                      onClick={() => toggleCategory(c.key)}
                      className={cn("px-2.5 py-1 rounded-full text-xs border disabled:opacity-40", on ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isChoice && !isEditing && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Values</Label>
              <div className="flex gap-2">
                <Input value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="Add a value and press Enter" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())} />
                <Button type="button" variant="outline" onClick={addOption} className="shrink-0" aria-label="Add value">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {options.map((option) => (
                  <span key={option} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                    {option}
                    <button type="button" onClick={() => setOptions(options.filter((o) => o !== option))} aria-label={`Remove ${option}`}>
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                ))}
                {options.length === 0 && <p className="text-xs text-muted-foreground">No values yet.</p>}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={required} onCheckedChange={setRequired} disabled={field?.system} />
              <span>
                Required
                <span className="block text-xs text-muted-foreground">Receiving and import refuse items without it.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={detail} onCheckedChange={setDetail} />
              <span>
                Behind "More details"
                <span className="block text-xs text-muted-foreground">Keeps the form short — the field opens itself when it has a value.</span>
              </span>
            </label>
            {type === "select" && field?.origin !== "customField" && (
              <label className="flex items-start gap-3 text-sm">
                <Switch checked={listMode === "strict"} onCheckedChange={(on) => setListMode(on ? "strict" : "open")} />
                <span>
                  Only values from the list
                  <span className="block text-xs text-muted-foreground">Off: the list is a suggestion and other values are accepted as typed.</span>
                </span>
              </label>
            )}
            {type === "text" && !isEditing && (
              <label className="flex items-start gap-3 text-sm">
                <Switch checked={unique} onCheckedChange={setUnique} />
                <span>
                  Must be unique
                  <span className="block text-xs text-muted-foreground">No two pieces in stock may share it (like a certificate or serial number).</span>
                </span>
              </label>
            )}
          </div>

          {!isEditing && (
            <div className="space-y-1">
              <Label htmlFor="field-help" className="text-xs text-muted-foreground">
                Help text
              </Label>
              <Input id="field-help" value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Shown under the field on the form" />
            </div>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create field"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
