import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CustomFieldEditorDialog } from "@/components/settings/CustomFieldEditorDialog";
import { deleteCustomFieldDefinition, listCustomFieldDefinitions, updateCustomFieldDefinition } from "@/lib/api/customFieldApi";
import { showSuccess } from "@/lib/utils";
import type { CustomFieldDefinition } from "@/types/customField";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const TYPE_LABELS: Record<CustomFieldDefinition["type"], string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  dropdown: "Dropdown",
};

export function CustomFieldsSettings() {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);

  const refresh = () => {
    listCustomFieldDefinitions().then(setDefinitions);
  };
  useEffect(refresh, []);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (definition: CustomFieldDefinition) => {
    setEditing(definition);
    setEditorOpen(true);
  };

  const toggleActive = async (definition: CustomFieldDefinition, active: boolean) => {
    await updateCustomFieldDefinition(definition.id, { active });
    refresh();
  };

  const handleDelete = async (definition: CustomFieldDefinition) => {
    if (!window.confirm(`Delete "${definition.label}"? Values already saved on items are kept but will no longer be editable.`)) return;
    await deleteCustomFieldDefinition(definition.id);
    showSuccess("Deleted", `${definition.label} removed.`);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Custom Fields</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Extra fields for Inventory items that OctaGem doesn't model out of the box — appear on the intake form, scoped to any category or all of them.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> New field
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {definitions.map((definition) => (
          <div key={definition.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {definition.label}
                {definition.required && <span className="text-destructive ml-1">*</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[definition.type]} · Applies to {definition.appliesTo}
                {definition.type === "dropdown" && definition.options?.length ? ` · ${definition.options.length} options` : ""}
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={definition.active} onCheckedChange={(checked) => toggleActive(definition, checked)} /> Active
            </label>
            <Button variant="ghost" size="icon" onClick={() => openEdit(definition)} className="h-7 w-7 shrink-0">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(definition)} className="h-7 w-7 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {definitions.length === 0 && <p className="text-sm text-muted-foreground px-3 py-6 text-center">No custom fields yet — add the first one above.</p>}
      </div>

      <CustomFieldEditorDialog open={editorOpen} onOpenChange={setEditorOpen} definition={editing} onSaved={refresh} />
    </div>
  );
}
