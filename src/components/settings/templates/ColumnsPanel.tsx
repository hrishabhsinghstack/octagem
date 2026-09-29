import { AddColumnPopover } from "@/components/settings/templates/AddColumnPopover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { columnLimit } from "@/lib/api/documentTemplateApi";
import type { RenderDiagnostic } from "@/lib/document/renderDocument";
import { cn } from "@/lib/utils";
import type { FieldDefinition } from "@/types/catalog";
import type { ColumnAlign, ColumnSource, DocumentTemplate, TemplateColumn } from "@/types/documentTemplate";
import { LINE_FIELD_LABELS } from "@/types/documentTemplate";
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface ColumnsPanelProps {
  template: DocumentTemplate;
  fields: FieldDefinition[];
  diagnostics: RenderDiagnostic[];
  onChange: (columns: TemplateColumn[]) => void;
  onLandscape: (landscape: boolean) => void;
}

const ALIGNMENTS: { key: ColumnAlign; label: string }[] = [
  { key: "left", label: "L" },
  { key: "center", label: "C" },
  { key: "right", label: "R" },
];

/** The header the document would print if nothing is typed — shown as the input's placeholder. */
function fallbackHeader(source: ColumnSource, fields: FieldDefinition[]): string {
  if (source.kind === "index") return "(no header)";
  if (source.kind === "line") return LINE_FIELD_LABELS[source.field];
  const field = fields.find((candidate) => candidate.key === source.fieldKey);
  return field ? `${field.label}${field.unit ? ` (${field.unit})` : ""}` : source.fieldKey;
}

function sourceLabel(source: ColumnSource): string {
  if (source.kind === "index") return "Row number";
  if (source.kind === "line") return "From the line";
  return "From inventory";
}

export function ColumnsPanel({ template, fields, diagnostics, onChange, onLandscape }: ColumnsPanelProps) {
  const columns = template.columns;
  const enabledCount = columns.filter((column) => column.enabled).length;
  const limit = columnLimit(template.options.landscape);
  const overLimit = enabledCount > limit;

  const patch = (id: string, changes: Partial<TemplateColumn>) => onChange(columns.map((column) => (column.id === id ? { ...column, ...changes } : column)));

  const move = (index: number, delta: number) => {
    const next = [...columns];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = (source: ColumnSource) =>
    onChange([
      ...columns,
      {
        id: `c-${crypto.randomUUID().slice(0, 8)}`,
        source,
        format: "auto",
        widthWeight: source.kind === "line" && source.field === "description" ? 5 : 2,
        hideWhenEmpty: true,
        enabled: true,
      },
    ]);

  const diagnosticFor = (id: string) => diagnostics.find((d) => d.columnId === id && (d.reason === "unknownField" || d.reason === "inactiveField"));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Columns</p>
          <p className="text-xs text-muted-foreground">
            {enabledCount} of {columns.length} switched on · {limit} fit {template.options.landscape ? "landscape" : "A4 portrait"}
          </p>
        </div>
        <AddColumnPopover columns={columns} fields={fields} onAdd={add} />
      </div>

      {overLimit && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-muted-foreground flex-1">
            {enabledCount} columns is more than {template.options.landscape ? "landscape" : "A4 portrait"} prints legibly.
            {!template.options.landscape && (
              <button type="button" onClick={() => onLandscape(true)} className="ml-1 font-medium text-foreground hover:underline">
                Switch to landscape
              </button>
            )}
          </p>
        </div>
      )}

      <div className="rounded-md border divide-y">
        {columns.map((column, index) => {
          const problem = diagnosticFor(column.id);
          return (
            <div key={column.id} className={cn("grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 px-3 py-2", !column.enabled && "opacity-55")}>
              {/* Arrows rather than drag-and-drop: no dnd library is installed, reordering ~8 rows does
                  not justify adding one, and arrows are keyboard-accessible for free. */}
              <div className="flex flex-col">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="disabled:opacity-25 hover:text-foreground text-muted-foreground">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === columns.length - 1}
                  aria-label="Move down"
                  className="disabled:opacity-25 hover:text-foreground text-muted-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-w-0 space-y-1">
                <Input
                  value={column.header ?? ""}
                  onChange={(e) => patch(column.id, { header: e.target.value })}
                  // Blank visibly means "follow the catalog", because the placeholder shows what prints.
                  placeholder={fallbackHeader(column.source, fields)}
                  className="h-8 text-sm"
                  aria-label="Column header"
                />
                {/* A div, not a p: Badge renders a div, which is invalid inside a paragraph. */}
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {sourceLabel(column.source)}
                  {problem?.reason === "unknownField" && (
                    <Badge variant="destructive" className="font-normal text-[10px] px-1.5 py-0">
                      field deleted
                    </Badge>
                  )}
                  {problem?.reason === "inactiveField" && (
                    <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
                      field switched off
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex rounded-md border overflow-hidden">
                {ALIGNMENTS.map((alignment) => (
                  <button
                    key={alignment.key}
                    type="button"
                    onClick={() => patch(column.id, { align: alignment.key })}
                    aria-label={`Align ${alignment.key}`}
                    aria-pressed={column.align === alignment.key}
                    className={cn("h-8 w-7 text-xs", column.align === alignment.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {alignment.label}
                  </button>
                ))}
              </div>

              <Input
                type="number"
                min={1}
                max={12}
                value={column.widthWeight}
                onChange={(e) => patch(column.id, { widthWeight: Number(e.target.value) || 1 })}
                className="h-8 w-14 text-sm text-center tabular-nums"
                aria-label="Relative width"
              />

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" title="Hide this column when no line has a value for it">
                <Switch checked={column.hideWhenEmpty} onCheckedChange={(checked) => patch(column.id, { hideWhenEmpty: checked })} />
                auto-hide
              </label>

              <div className="flex items-center gap-1">
                <Switch checked={column.enabled} onCheckedChange={(checked) => patch(column.id, { enabled: checked })} aria-label="Column on" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChange(columns.filter((candidate) => candidate.id !== column.id))}
                  aria-label="Remove column"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {columns.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No columns yet — add one to start.</p>}
      </div>

      <p className="text-xs text-muted-foreground">
        Width is relative, not fixed: a 5 is roughly five times a 1, and the printed table shares the page between whichever columns survive auto-hide.
      </p>
    </div>
  );
}
