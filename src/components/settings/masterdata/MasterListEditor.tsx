import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { addListEntry, deleteListEntry, getList, updateListEntry } from "@/lib/store/masterDataStore";
import { showError, showSuccess } from "@/lib/utils";
import type { MasterListDefinition, MasterListEntry } from "@/types/masterData";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export function MasterListEditor({ definition, scopeOptions }: { definition: MasterListDefinition; scopeOptions?: MasterListEntry[] }) {
  const [entries, setEntries] = useState<MasterListEntry[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newScope, setNewScope] = useState<string>(scopeOptions?.[0]?.label ?? "");
  const [newNumericValue, setNewNumericValue] = useState("");

  const refresh = () => setEntries(getList(definition.key, false));

  useEffect(() => {
    refresh();
    setNewScope(scopeOptions?.[0]?.label ?? "");
    setNewNumericValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.key]);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    if (definition.hasNumericValue && newNumericValue === "") {
      showError("Missing value", `Enter a ${definition.numericValueLabel?.toLowerCase() ?? "value"} for ${newLabel.trim()}.`);
      return;
    }
    addListEntry(definition.key, newLabel.trim(), definition.scopedBy ? newScope : undefined, definition.hasNumericValue ? Number(newNumericValue) : undefined);
    setNewLabel("");
    setNewNumericValue("");
    refresh();
    showSuccess("Added", `${newLabel.trim()} added to ${definition.title}.`);
  };

  const toggleActive = (entry: MasterListEntry) => {
    updateListEntry(definition.key, entry.id, { active: !entry.active });
    refresh();
  };

  const updateNumericValue = (entry: MasterListEntry, value: string) => {
    updateListEntry(definition.key, entry.id, { numericValue: value === "" ? undefined : Number(value) });
    refresh();
  };

  const remove = (entry: MasterListEntry) => {
    deleteListEntry(definition.key, entry.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{definition.title}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{definition.description}</p>
      </div>

      {definition.hasNumericValue && (
        <p className="text-xs text-muted-foreground -mt-2">{definition.numericValueLabel}, manually maintained — no live feed.</p>
      )}

      <div className="flex gap-2">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={`Add a new ${definition.title.toLowerCase()} value`} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        {definition.hasNumericValue && (
          <Input
            type="number"
            value={newNumericValue}
            onChange={(e) => setNewNumericValue(e.target.value)}
            placeholder={definition.numericValueLabel}
            className="w-32 shrink-0"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        )}
        {definition.scopedBy && scopeOptions && (
          <Select value={newScope} onValueChange={setNewScope}>
            <SelectTrigger className="w-44 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((s) => (
                <SelectItem key={s.id} value={s.label}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={handleAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" /> Add
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 px-3 py-2">
            <span className={entry.active ? "text-sm flex-1" : "text-sm flex-1 text-muted-foreground line-through"}>{entry.label}</span>
            {entry.scopeValue && <Badge variant="outline">{entry.scopeValue}</Badge>}
            {definition.hasNumericValue && (
              <Input
                type="number"
                value={entry.numericValue ?? ""}
                onChange={(e) => updateNumericValue(entry, e.target.value)}
                className="w-24 h-8 text-sm shrink-0"
              />
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={entry.active} onCheckedChange={() => toggleActive(entry)} /> Active
            </label>
            <Button variant="ghost" size="icon" onClick={() => remove(entry)} className="h-7 w-7 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-muted-foreground px-3 py-6 text-center">No values yet — add the first one above.</p>}
      </div>
    </div>
  );
}
