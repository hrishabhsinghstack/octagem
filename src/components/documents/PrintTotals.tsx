import type { RenderedTotalsRow } from "@/lib/document/renderDocument";
import { cn } from "@/lib/utils";

/** The money block under the line table. Which rows appear, and what they are called, comes from the template. */
export function PrintTotals({ rows }: { rows: RenderedTotalsRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="flex justify-end break-inside-avoid">
      <div className="w-56 space-y-1 text-xs">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn("flex justify-between", row.emphasis && "font-semibold text-sm border-t border-black/20 pt-1 mt-1")}
          >
            <span className={cn(!row.emphasis && "text-black/60")}>{row.label}</span>
            <span className="tabular-nums">{row.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
