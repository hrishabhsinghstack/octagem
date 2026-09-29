import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { columnLimit } from "@/lib/api/documentTemplateApi";
import type { TemplateOptions } from "@/types/documentTemplate";

interface OptionsPanelProps {
  options: TemplateOptions;
  enabledColumns: number;
  onChange: (options: TemplateOptions) => void;
}

export function OptionsPanel({ options, enabledColumns, onChange }: OptionsPanelProps) {
  const patch = (changes: Partial<TemplateOptions>) => onChange({ ...options, ...changes });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Page &amp; branding</p>
        <p className="text-xs text-muted-foreground">How the printed document is laid out.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Paper</Label>
          <Select value={options.paper} onValueChange={(value) => patch({ paper: value as TemplateOptions["paper"] })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Orientation</Label>
          <Select value={options.landscape ? "landscape" : "portrait"} onValueChange={(value) => patch({ landscape: value === "landscape" })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait — up to {columnLimit(false)} columns</SelectItem>
              <SelectItem value="landscape">Landscape — up to {columnLimit(true)} columns</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {enabledColumns} column{enabledColumns === 1 ? "" : "s"} switched on.
          </p>
        </div>
      </div>

      <div className="rounded-md border divide-y">
        <Toggle
          label="Show the company logo"
          hint="Turn off for pre-printed letterhead, where it would print twice."
          checked={options.showLogo}
          onChange={(checked) => patch({ showLogo: checked })}
        />
        <Toggle label="Show the business address" checked={options.showBusinessAddress} onChange={(checked) => patch({ showBusinessAddress: checked })} />
        <Toggle
          label="Show “Powered by OctaGem”"
          hint="The small credit in the page footer."
          checked={options.showPoweredBy}
          onChange={(checked) => patch({ showPoweredBy: checked })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Accent colour</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={options.accentColor ?? "#000000"}
            onChange={(e) => patch({ accentColor: e.target.value })}
            className="h-9 w-14 rounded border cursor-pointer"
            aria-label="Accent colour"
          />
          {options.accentColor && (
            <button type="button" onClick={() => patch({ accentColor: undefined })} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Follow Branding settings
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Used for the document title and the rule under the letterhead.</p>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 px-3 py-2.5 cursor-pointer">
      <span>
        <span className="text-sm block">{label}</span>
        {hint && <span className="text-xs text-muted-foreground block mt-0.5">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0 mt-0.5" />
    </label>
  );
}
