import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createCustomFieldDefinition, updateCustomFieldDefinition } from "@/lib/api/customFieldApi";
import { showError, showSuccess } from "@/lib/utils";
import type { CustomFieldDefinition, CustomFieldType } from "@/types/customField";
import type { InventoryCategory } from "@/types/inventory";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  dropdown: "Dropdown",
};

const APPLIES_TO_OPTIONS: (InventoryCategory | "All")[] = ["All", "Diamond", "Jewelry", "Watch"];

interface CustomFieldEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: CustomFieldDefinition | null;
  onSaved: () => void;
}

export function CustomFieldEditorDialog({ open, onOpenChange, definition, onSaved }: CustomFieldEditorDialogProps) {
  const isEditing = Boolean(definition);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [appliesTo, setAppliesTo] = useState<InventoryCategory | "All">("All");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(definition?.label ?? "");
      setType(definition?.type ?? "text");
      setAppliesTo(definition?.appliesTo ?? "All");
      setRequired(definition?.required ?? false);
      setOptions(definition?.options ?? []);
      setNewOption("");
    }
  }, [open, definition]);

  const addOption = () => {
    if (!newOption.trim() || options.includes(newOption.trim())) return;
    setOptions((prev) => [...prev, newOption.trim()]);
    setNewOption("");
  };
  const removeOption = (option: string) => setOptions((prev) => prev.filter((o) => o !== option));

  const handleSubmit = async () => {
    if (!label.trim()) {
      showError("Missing field", "Give this field a label.");
      return;
    }
    if (type === "dropdown" && options.length === 0) {
      showError("Missing options", "Add at least one dropdown option.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing && definition) {
        await updateCustomFieldDefinition(definition.id, { label: label.trim(), type, options: type === "dropdown" ? options : undefined, appliesTo, required });
        showSuccess("Saved", `${label.trim()} updated.`);
      } else {
        await createCustomFieldDefinition({ label: label.trim(), type, options: type === "dropdown" ? options : undefined, appliesTo, required });
        showSuccess("Field created", `${label.trim()} is now available on the intake form.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Error", error?.message || "Could not save this field.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit custom field" : "New custom field"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Label *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" placeholder="e.g. Special Order" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)} disabled={isEditing}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Applies to</Label>
              <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as InventoryCategory | "All")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLIES_TO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {type === "dropdown" && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Options</Label>
              <div className="flex gap-2">
                <Input value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="Add an option" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())} />
                <Button type="button" variant="outline" onClick={addOption} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {options.map((option) => (
                  <span key={option} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                    {option}
                    <button type="button" onClick={() => removeOption(option)}>
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                ))}
                {options.length === 0 && <p className="text-xs text-muted-foreground">No options yet.</p>}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={required} onCheckedChange={setRequired} /> Required on intake
          </label>
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
