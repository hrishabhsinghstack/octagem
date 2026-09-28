import { FIELD_TYPE_LABELS, FieldEditorDialog } from "@/components/settings/catalog/FieldEditorDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { deleteTenantField, getCatalog, listCategories, updateField } from "@/lib/api/catalogApi";
import { allFields, appliesToCategory, type CatalogState } from "@/lib/inventory/registry";
import { cn, showError, showSuccess } from "@/lib/utils";
import type { CategoryDefinition, FieldDefinition, FieldSection } from "@/types/catalog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const SECTION_ORDER: { key: FieldSection; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "specification", label: "Specification" },
  { key: "certificate", label: "Certificate" },
  { key: "pricing", label: "Pricing" },
  { key: "market", label: "Market packs" },
  { key: "custom", label: "Custom fields" },
];

const ORIGIN_LABEL: Record<FieldDefinition["origin"], string> = { builtIn: "Built-in", tenant: "Added", customField: "Custom" };

export function FieldsPanel({ version }: { version: number }) {
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [categoryKey, setCategoryKey] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FieldDefinition | null>(null);

  const refresh = async () => {
    const [state, all] = await Promise.all([getCatalog(), listCategories(false)]);
    setCatalog(state);
    setCategories(all);
    setCategoryKey((current) => (all.some((c) => c.key === current) ? current : all[0]?.key ?? ""));
  };

  useEffect(() => {
    refresh();
  }, [version]);

  const fields = useMemo(() => {
    if (!catalog) return [];
    // Pack fields for disabled packs are managed on the Markets tab, not listed here.
    return allFields(catalog).filter((f) => appliesToCategory(f, categoryKey) && (!f.pack || catalog.enabledPacks.includes(f.pack)));
  }, [catalog, categoryKey]);

  const apply = async (field: FieldDefinition, patch: Parameters<typeof updateField>[1]) => {
    try {
      await updateField(field.key, patch);
      refresh();
    } catch (error: any) {
      showError("Could not update", error?.message);
    }
  };

  const handleDelete = async (field: FieldDefinition) => {
    if (!window.confirm(`Delete "${field.label}"? Values already saved on items are kept but no longer shown or edited.`)) return;
    try {
      await deleteTenantField(field.key);
      showSuccess("Deleted", `${field.label} removed.`);
      refresh();
    } catch (error: any) {
      showError("Could not delete", error?.message);
    }
  };

  const activeCount = fields.filter((f) => f.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={c.key === categoryKey}
              onClick={() => setCategoryKey(c.key)}
              className={cn("px-3 py-1 rounded-full text-sm border", c.key === categoryKey ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted", !c.active && "opacity-60")}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> New field
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {activeCount} of {fields.length} fields in use. Switching a field off hides it from the form and import template — values already saved stay on the items.
      </p>

      <div className="border rounded-md">
        <div className="grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem_4rem] gap-2 px-3 py-2 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground">
          <span>Field</span>
          <span className="text-center">In use</span>
          <span className="text-center">Required</span>
          <span className="text-center">Quick form</span>
          <span />
        </div>
        {SECTION_ORDER.map(({ key, label }) => {
          const inSection = fields.filter((f) => f.section === key);
          if (inSection.length === 0) return null;
          return (
            <div key={key}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</p>
              {inSection.map((field) => (
                <div key={field.key} className={cn("grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem_4rem] gap-2 items-center px-3 py-1.5 hover:bg-muted/30", !field.active && "text-muted-foreground")}>
                  <div className="min-w-0">
                    <p className="text-sm truncate">
                      {field.label}
                      {field.unit && <span className="text-muted-foreground"> ({field.unit})</span>}
                    </p>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      {FIELD_TYPE_LABELS[field.type]}
                      {field.type === "select" && <span>· {field.listMode === "open" ? "open list" : "strict list"}</span>}
                      {field.unique && <span>· unique</span>}
                      <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
                        {field.pack ? `${field.pack} pack` : ORIGIN_LABEL[field.origin]}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={field.active} disabled={field.system} onCheckedChange={(active) => apply(field, { active })} aria-label={`${field.label} in use`} />
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={field.required} disabled={field.system || !field.active} onCheckedChange={(required) => apply(field, { required })} aria-label={`${field.label} required`} />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={field.tier !== "detail"}
                      disabled={!field.active}
                      onCheckedChange={(on) => apply(field, { tier: on ? "essential" : "detail" })}
                      aria-label={`${field.label} on the quick form`}
                    />
                  </div>
                  <div className="flex justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(field);
                        setEditorOpen(true);
                      }}
                      aria-label={`Edit ${field.label}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {field.origin === "tenant" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(field)} aria-label={`Delete ${field.label}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <FieldEditorDialog open={editorOpen} onOpenChange={setEditorOpen} categories={categories} field={editing} defaultCategory={categoryKey} onSaved={refresh} />
    </div>
  );
}
