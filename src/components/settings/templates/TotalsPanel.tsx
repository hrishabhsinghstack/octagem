import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TotalsRow } from "@/types/documentTemplate";

/** Why a row can't simply be switched off, shown inline rather than as a disabled control with no reason. */
const LOCKED: Partial<Record<TotalsRow["key"], string>> = {
  total: "Always prints — a document with no total is not a document.",
};

export function TotalsPanel({ totals, onChange }: { totals: TotalsRow[]; onChange: (totals: TotalsRow[]) => void }) {
  const patch = (key: TotalsRow["key"], changes: Partial<TotalsRow>) =>
    onChange(totals.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Totals</p>
        <p className="text-xs text-muted-foreground">Which money rows print under the table, and what they are called.</p>
      </div>

      <div className="rounded-md border divide-y">
        {totals.map((row) => {
          const locked = LOCKED[row.key];
          return (
            <div key={row.key} className={cn("grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2", !row.show && !locked && "opacity-55")}>
              <div className="min-w-0 space-y-1">
                <Input value={row.label} onChange={(e) => patch(row.key, { label: e.target.value })} className="h-8 text-sm" aria-label={`${row.key} label`} />
                {locked && <p className="text-xs text-muted-foreground">{locked}</p>}
              </div>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" title="Leave this row out when the amount is zero">
                <Switch checked={row.hideWhenZero} onCheckedChange={(checked) => patch(row.key, { hideWhenZero: checked })} disabled={Boolean(locked)} />
                hide if 0
              </label>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" title="Bold, above a rule">
                <Switch checked={row.emphasis} onCheckedChange={(checked) => patch(row.key, { emphasis: checked })} />
                emphasise
              </label>

              <Switch checked={row.show} onCheckedChange={(checked) => patch(row.key, { show: checked })} disabled={Boolean(locked)} aria-label={`Show ${row.key}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
