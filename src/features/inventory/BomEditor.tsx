import { SearchSelect } from "@/components/catalog/SearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { JewelryComponent } from "@/types/inventory";
import { Plus, Trash2 } from "lucide-react";

export interface BomLists {
  gemstoneTypes: string[];
  shapes: string[];
  colors: string[];
  clarities: string[];
  fancyIntensities: string[];
  treatments: string[];
  labs: string[];
}

interface BomEditorProps {
  components: JewelryComponent[];
  onChange: (components: JewelryComponent[]) => void;
  lists: BomLists;
}

const emptyComponent = (): JewelryComponent => ({ id: crypto.randomUUID(), type: "Diamond", quantity: 1, isCenter: false });

const numberOrUndefined = (text: string) => {
  const value = Number(text);
  return text.trim() === "" || Number.isNaN(value) ? undefined : value;
};

/**
 * The jewelry Bill of Materials — a child table, not flat catalog fields. Color and clarity accept
 * ranges and free text (mounted melee is graded "G-H / SI1" as a lot), the other columns come from
 * master data.
 */
export function BomEditor({ components, onChange, lists }: BomEditorProps) {
  const update = (id: string, patch: Partial<JewelryComponent>) => onChange(components.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const small = "h-8 text-xs";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs text-muted-foreground">Bill of materials</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...components, emptyComponent()])} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add stone / component
        </Button>
      </div>
      <div className="space-y-2">
        {components.length > 0 && (
          <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_64px_72px_64px_28px] gap-1.5 px-1.5 text-[11px] text-muted-foreground">
            <span>Type</span>
            <span>Shape</span>
            <span>Color</span>
            <span>Clarity</span>
            <span>Qty</span>
            <span>Weight (ct)</span>
            <span>Center</span>
            <span />
          </div>
        )}
        {components.map((c) => (
          <div key={c.id} className="rounded-md border p-1.5 space-y-1.5">
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_64px_72px_64px_28px] gap-1.5 items-center">
              <SearchSelect value={c.type} onChange={(v) => update(c.id, { type: v })} options={lists.gemstoneTypes} className={small} />
              <SearchSelect value={c.shape ?? ""} onChange={(v) => update(c.id, { shape: v || undefined })} options={lists.shapes} placeholder="Shape" clearable className={small} />
              <SearchSelect value={c.color ?? ""} onChange={(v) => update(c.id, { color: v || undefined })} options={lists.colors} placeholder="Color" allowCustom clearable className={small} />
              <SearchSelect value={c.clarity ?? ""} onChange={(v) => update(c.id, { clarity: v || undefined })} options={lists.clarities} placeholder="Clarity" allowCustom clearable className={small} />
              <Input inputMode="numeric" value={c.quantity} onChange={(e) => update(c.id, { quantity: numberOrUndefined(e.target.value) ?? 0 })} aria-label="Quantity" className={`${small} tabular-nums`} />
              <Input inputMode="decimal" value={c.weightCarats ?? ""} onChange={(e) => update(c.id, { weightCarats: numberOrUndefined(e.target.value) })} aria-label="Weight in carats" className={`${small} tabular-nums`} />
              <div className="flex justify-center">
                <Switch checked={c.isCenter} onCheckedChange={(checked) => update(c.id, { isCenter: checked })} aria-label="Center stone" />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(components.filter((row) => row.id !== c.id))} className="h-8 w-8" aria-label="Remove row">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-6 gap-1.5 items-center">
              <SearchSelect value={c.fancyColor?.intensity ?? ""} onChange={(v) => update(c.id, { fancyColor: v ? { ...c.fancyColor, intensity: v } : undefined })} options={lists.fancyIntensities} placeholder="Fancy intensity" clearable className="h-7 text-[11px]" />
              <SearchSelect value={c.treatment ?? ""} onChange={(v) => update(c.id, { treatment: v || undefined })} options={lists.treatments} placeholder="Treatment" clearable className="h-7 text-[11px]" />
              <Input value={c.size ?? ""} onChange={(e) => update(c.id, { size: e.target.value || undefined })} placeholder="Size" className="h-7 text-[11px]" />
              <Input value={c.stoneNumber ?? ""} onChange={(e) => update(c.id, { stoneNumber: e.target.value || undefined })} placeholder="Stone #" className="h-7 text-[11px]" />
              <SearchSelect value={c.lab ?? ""} onChange={(v) => update(c.id, { lab: v || undefined })} options={lists.labs} placeholder="Lab" clearable className="h-7 text-[11px]" />
              <Input value={c.certificateNumber ?? ""} onChange={(e) => update(c.id, { certificateNumber: e.target.value || undefined })} placeholder="Cert #" className="h-7 text-[11px]" />
            </div>
          </div>
        ))}
        {components.length === 0 && <p className="text-xs text-muted-foreground">No mounted stones — plain metal piece.</p>}
      </div>
    </div>
  );
}
