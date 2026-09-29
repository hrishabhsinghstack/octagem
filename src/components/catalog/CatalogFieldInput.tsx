import { SearchSelect } from "@/components/catalog/SearchSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { FieldDefinition } from "@/types/catalog";
import { AlertTriangle, Sparkles } from "lucide-react";

export interface CatalogFieldInputProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  options?: string[];
  error?: string;
  warning?: string;
  /** "Did you mean" fix for a typo — one click applies it. */
  fixSuggestion?: string;
  /** A derived value (e.g. asking price from Rap) the user can accept with one click. */
  derived?: { label: string; basis: string; value: number };
  disabled?: boolean;
  /** Master-data admins can add a missing value to the field's list without leaving the form. */
  onAddOption?: (label: string) => void;
  className?: string;
}

const inputValue = (value: unknown) => (value === undefined || value === null ? "" : String(value));

/**
 * Renders one catalog field by type. Values stay raw (strings as typed) until validation coerces
 * them — so "1,250" or "1.52 ct" is accepted exactly as the import would accept it.
 */
export function CatalogFieldInput({ field, value, onChange, onBlur, options = [], error, warning, fixSuggestion, derived, disabled, onAddOption, className }: CatalogFieldInputProps) {
  const id = `field-${field.key}`;
  const describedBy = error || warning ? `${id}-message` : undefined;
  const invalid = Boolean(error);

  let control: React.ReactNode;
  switch (field.type) {
    case "boolean":
      control = (
        <div className="h-10 flex items-center">
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} disabled={disabled} />
        </div>
      );
      break;
    case "select":
      control = (
        <SearchSelect
          id={id}
          aria-describedby={describedBy}
          value={inputValue(value)}
          onChange={onChange}
          options={options}
          disabled={disabled}
          invalid={invalid}
          allowCustom={field.listMode === "open"}
          onAddOption={field.source?.kind === "masterList" ? onAddOption : undefined}
          clearable={!field.required}
          placeholder={field.source?.kind === "masterList" && field.source.scopedByField && options.length === 0 ? "Choose the parent value first" : "Select…"}
        />
      );
      break;
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {options.map((option) => {
            const active = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(active ? selected.filter((s) => s !== option) : [...selected, option])}
                className={cn("px-2.5 py-1 rounded-full text-xs border transition-colors", active ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
              >
                {option}
              </button>
            );
          })}
          {options.length === 0 && <span className="text-xs text-muted-foreground">No values set up yet.</span>}
        </div>
      );
      break;
    }
    case "date":
      control = <Input id={id} type="date" value={inputValue(value)} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={cn(invalid && "border-destructive")} />;
      break;
    case "number":
    case "integer":
      control = (
        <div className="relative">
          <Input
            id={id}
            inputMode={field.type === "integer" ? "numeric" : "decimal"}
            value={inputValue(value)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn("tabular-nums", field.unit && "pr-9", invalid && "border-destructive")}
          />
          {field.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{field.unit}</span>}
        </div>
      );
      break;
    default:
      control = (
        <Input
          id={id}
          value={inputValue(value)}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(field.uppercase && "uppercase placeholder:normal-case", invalid && "border-destructive")}
        />
      );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {control}
      {error ? (
        <p id={`${id}-message`} className="text-xs text-destructive">
          {error}
          {fixSuggestion && (
            <button type="button" onClick={() => onChange(fixSuggestion)} className="ml-1 underline underline-offset-2 font-medium">
              Use “{fixSuggestion}”
            </button>
          )}
        </p>
      ) : warning ? (
        <p id={`${id}-message`} className="text-xs text-amber-600 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {warning}
        </p>
      ) : field.help ? (
        <p className="text-xs text-muted-foreground">{field.help}</p>
      ) : null}
      {derived && (
        <button type="button" onClick={() => onChange(String(derived.value))} className="flex items-center gap-1 text-xs text-primary hover:underline" title={derived.basis}>
          <Sparkles className="h-3 w-3" /> Use {derived.label} <span className="text-muted-foreground">· {derived.basis}</span>
        </button>
      )}
    </div>
  );
}
