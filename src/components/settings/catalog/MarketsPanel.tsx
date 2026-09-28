import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getCatalog, getMarketSettings, listCategories, setFieldOverride, updateMarketSettings } from "@/lib/api/catalogApi";
import { MARKET_PACKS } from "@/lib/inventory/builtInFields";
import type { DateOrder } from "@/lib/inventory/fieldValues";
import { allFields } from "@/lib/inventory/registry";
import type { MarketSettings } from "@/lib/store/catalogStore";
import { cn, showSuccess } from "@/lib/utils";
import type { CategoryDefinition, FieldDefinition, MarketPackKey } from "@/types/catalog";
import { useEffect, useState } from "react";

const NUMBER_FORMATS = [
  { value: "en-US", label: "1,234,567.89 (US / international)" },
  { value: "en-IN", label: "12,34,567.89 (India — lakh / crore)" },
  { value: "de-DE", label: "1.234.567,89 (Europe)" },
];

export function MarketsPanel({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [packFields, setPackFields] = useState<FieldDefinition[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);

  const refresh = async () => {
    const [market, catalog, all] = await Promise.all([getMarketSettings(), getCatalog(), listCategories(false)]);
    setSettings(market);
    setPackFields(allFields(catalog).filter((f) => f.pack));
    setCategories(all);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!settings) return null;

  const save = async (next: MarketSettings, message?: string) => {
    await updateMarketSettings(next);
    setSettings(next);
    if (message) showSuccess("Saved", message);
    onChanged();
  };

  const togglePack = (key: MarketPackKey, on: boolean) => {
    const enabledPacks = on ? [...settings.enabledPacks, key] : settings.enabledPacks.filter((k) => k !== key);
    const pack = MARKET_PACKS.find((p) => p.key === key);
    save({ ...settings, enabledPacks }, `${pack?.label} pack ${on ? "enabled" : "disabled"}.`);
  };

  /** Pack fields default to Jewelry; a tenant with its own gold category (e.g. "Gold ornaments") extends them to it. */
  const toggleFieldCategory = async (field: FieldDefinition, categoryKey: string) => {
    const current = field.categories === "All" ? categories.map((c) => c.key) : field.categories;
    const next = current.includes(categoryKey) ? current.filter((k) => k !== categoryKey) : [...current, categoryKey];
    if (next.length === 0) return;
    await setFieldOverride(field.key, { categories: next });
    refresh();
    onChanged();
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Market packs</h4>
          <p className="text-sm text-muted-foreground">Region-specific fields. Enable every market you trade in — the fields join the form, detail view and import template.</p>
        </div>
        {MARKET_PACKS.map((pack) => {
          const on = settings.enabledPacks.includes(pack.key);
          const fields = packFields.filter((f) => f.pack === pack.key);
          return (
            <div key={pack.key} className={cn("rounded-md border p-4 space-y-3", on && "border-primary/40")}>
              <label className="flex items-start gap-3">
                <Switch checked={on} onCheckedChange={(checked) => togglePack(pack.key, checked)} />
                <span>
                  <span className="text-sm font-medium">{pack.label}</span>
                  <span className="block text-xs text-muted-foreground">{pack.description}</span>
                </span>
              </label>
              {on && (
                <div className="space-y-2 pl-12">
                  {fields.map((field) => {
                    const scope = field.categories === "All" ? categories.map((c) => c.key) : field.categories;
                    return (
                      <div key={field.key} className="flex items-center gap-3 text-sm">
                        <span className="w-40 shrink-0">{field.label}</span>
                        <div className="flex flex-wrap gap-1">
                          {categories.map((c) => (
                            <button
                              key={c.key}
                              type="button"
                              aria-pressed={scope.includes(c.key)}
                              onClick={() => toggleFieldCategory(field, c.key)}
                              className={cn("px-2 py-0.5 rounded-full text-[11px] border", scope.includes(c.key) ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Dates &amp; numbers</h4>
          <p className="text-sm text-muted-foreground">How spreadsheets are read on import and how numbers are shown.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Read dates like 03/04/2026 as</Label>
            <Select value={settings.dateOrder} onValueChange={(v) => save({ ...settings, dateOrder: v as DateOrder }, "Date order updated.")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MDY">March 4 (month first — US)</SelectItem>
                <SelectItem value="DMY">3 April (day first — India, UK, most others)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Number format</Label>
            <Select value={settings.numberLocale} onValueChange={(v) => save({ ...settings, numberLocale: v }, "Number format updated.")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Import always accepts ISO dates (2026-03-04) and Excel date cells whatever the setting — the order only settles ambiguous ones.</p>
      </section>
    </div>
  );
}
