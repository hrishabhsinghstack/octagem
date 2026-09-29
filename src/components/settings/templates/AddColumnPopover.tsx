import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FieldDefinition, FieldSection } from "@/types/catalog";
import type { ColumnSource, LineFieldKey, TemplateColumn } from "@/types/documentTemplate";
import { LINE_FIELD_LABELS } from "@/types/documentTemplate";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";

const SECTION_LABELS: Record<FieldSection, string> = {
  identity: "Identity",
  specification: "Specification",
  certificate: "Certificate",
  components: "Components",
  pricing: "Pricing",
  market: "Market packs",
  custom: "Custom fields",
};

const SECTION_ORDER: FieldSection[] = ["identity", "specification", "certificate", "components", "market", "custom", "pricing"];

const LINE_FIELDS: LineFieldKey[] = ["description", "quantity", "unitPrice", "lineTotal", "lineDiscount", "lineTax"];

interface AddColumnPopoverProps {
  columns: TemplateColumn[];
  fields: FieldDefinition[];
  onAdd: (source: ColumnSource) => void;
  disabled?: boolean;
}

/** Whether a source is already a column, so the list can show it ticked rather than silently duplicating. */
function isPresent(columns: TemplateColumn[], source: ColumnSource): boolean {
  return columns.some((column) => {
    if (column.source.kind !== source.kind) return false;
    if (column.source.kind === "catalogField" && source.kind === "catalogField") return column.source.fieldKey === source.fieldKey;
    if (column.source.kind === "line" && source.kind === "line") return column.source.field === source.field;
    return true;
  });
}

/**
 * Searchable picker grouped the way the catalog itself is grouped, so someone who knows Settings →
 * Inventory Catalog finds a field where they expect it. Built on cmdk and Popover, both already
 * dependencies — no new library for a list.
 */
export function AddColumnPopover({ columns, fields, onAdd, disabled }: AddColumnPopoverProps) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const active = fields.filter((field) => field.active);
    return SECTION_ORDER.map((section) => ({
      section,
      label: SECTION_LABELS[section],
      fields: active.filter((field) => field.section === section).sort((a, b) => a.sortOrder - b.sortOrder),
    })).filter((group) => group.fields.length > 0);
  }, [fields]);

  const choose = (source: ColumnSource) => {
    onAdd(source);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={disabled}>
          <Plus className="h-3 w-3 mr-1" /> Add column
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search columns…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No matching column.</CommandEmpty>

            <CommandGroup heading="Document">
              <Row label="Row number" present={isPresent(columns, { kind: "index" })} onSelect={() => choose({ kind: "index" })} value="row number index" />
              {LINE_FIELDS.map((field) => (
                <Row
                  key={field}
                  label={LINE_FIELD_LABELS[field]}
                  value={`line ${LINE_FIELD_LABELS[field]}`}
                  present={isPresent(columns, { kind: "line", field })}
                  onSelect={() => choose({ kind: "line", field })}
                />
              ))}
            </CommandGroup>

            {grouped.map((group) => (
              <CommandGroup key={group.section} heading={group.label}>
                {group.fields.map((field) => (
                  <Row
                    key={field.key}
                    label={`${field.label}${field.unit ? ` (${field.unit})` : ""}`}
                    value={`${field.label} ${field.key}`}
                    present={isPresent(columns, { kind: "catalogField", fieldKey: field.key })}
                    onSelect={() => choose({ kind: "catalogField", fieldKey: field.key })}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, present, onSelect }: { label: string; value: string; present: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={value} onSelect={onSelect}>
      <Check className={cn("h-3.5 w-3.5 mr-2", present ? "opacity-100" : "opacity-0")} />
      <span className={cn(present && "text-muted-foreground")}>{label}</span>
    </CommandItem>
  );
}
