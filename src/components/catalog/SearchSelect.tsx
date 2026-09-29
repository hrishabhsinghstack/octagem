import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normaliseToken } from "@/lib/inventory/fieldValues";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";

interface SearchSelectProps {
  /**
   * Put on the trigger button, so a `<label for>` actually resolves and the form can focus this
   * field when it scrolls to a validation error. Without it the label pointed at nothing.
   */
  id?: string;
  "aria-describedby"?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Open lists: offer the typed text as a value even when it is not in the list. */
  allowCustom?: boolean;
  /** When set, offers "Add to list" for typed text not in the list (master-data admins only). */
  onAddOption?: (label: string) => void;
  /** Offer a "Clear" row for optional fields. */
  clearable?: boolean;
  className?: string;
}

/**
 * Exact match first, then prefix, then substring — so "vs1" lands on VS1, not the VVS1 listed above
 * it. Enter picks the top-ranked row, which makes typing a value and pressing Enter reliable.
 */
function rank(item: string, query: string): number {
  const target = normaliseToken(query);
  if (!target) return 1;
  // Action rows always rank below real values, so Enter never adds a typo to master data while a
  // listed value matches — adding stays a deliberate click (or Enter only when nothing matches).
  if (item.startsWith("__use__")) return 0.2;
  if (item.startsWith("__add__")) return 0.1;
  if (item === "__clear__") return 0;
  const candidate = normaliseToken(item);
  if (candidate === target) return 1;
  if (candidate.startsWith(target)) return 0.8;
  return candidate.includes(target) ? 0.4 : 0;
}

/**
 * Type-to-filter dropdown for master-data values. Matching ignores case and separators, so "vs1"
 * finds VS1 — the same normalisation the validator uses, so what the search finds is what saves.
 */
export function SearchSelect({
  id,
  "aria-describedby": describedBy,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  invalid,
  allowCustom,
  onAddOption,
  clearable,
  className,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const typed = search.trim();
  const exists = typed !== "" && options.some((option) => normaliseToken(option) === normaliseToken(typed));
  const choose = (next: string) => {
    onChange(next);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn("w-full justify-between font-normal px-3", !value && "text-muted-foreground", invalid && "border-destructive", className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[12rem] p-0" align="start">
        <Command filter={rank}>
          <CommandInput placeholder="Search…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{options.length === 0 ? "No values set up yet." : "No match."}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => choose(option)}>
                  <Check className={cn("h-3.5 w-3.5", value === option ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
            {typed && !exists && (allowCustom || onAddOption) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {allowCustom && (
                    <CommandItem value={`__use__${typed}`} onSelect={() => choose(typed)}>
                      Use “{typed}”
                    </CommandItem>
                  )}
                  {onAddOption && (
                    <CommandItem
                      value={`__add__${typed}`}
                      onSelect={() => {
                        onAddOption(typed);
                        choose(typed);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add “{typed}” to the list
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
            {clearable && value && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={() => choose("")} className="text-muted-foreground">
                    Clear
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
