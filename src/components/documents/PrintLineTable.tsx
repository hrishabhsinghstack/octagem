import type { RenderedColumn, RenderedRow } from "@/lib/document/renderDocument";
import { cn } from "@/lib/utils";

interface PrintLineTableProps {
  columns: RenderedColumn[];
  rows: RenderedRow[];
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/**
 * The printed line table. Column widths arrive as percentages from the renderer and are applied as
 * inline styles on <col> elements — never as Tailwind classes.
 *
 * That is not a style preference: Tailwind's JIT scans source text at build time, so a runtime-
 * interpolated arbitrary value like `w-[${pct}%]` produces no CSS at all and the table silently falls
 * back to auto layout, which is exactly the bug this feature exists to avoid.
 */
export function PrintLineTable({ columns, rows }: PrintLineTableProps) {
  if (columns.length === 0) return null;

  return (
    <table className="w-full table-fixed text-xs border-t border-b border-black/20 mb-4">
      <colgroup>
        {columns.map((column) => (
          <col key={column.id} style={{ width: `${column.widthPct}%` }} />
        ))}
      </colgroup>
      <thead>
        {/* <thead> repeats on every page natively, so a table spanning pages keeps its headers. */}
        <tr className="border-b border-black/20">
          {columns.map((column) => (
            <th key={column.id} className={cn("py-1.5 font-medium align-bottom break-words", ALIGN[column.align])}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          // A row split across a page break is unreadable on a document someone has to sign.
          <tr key={row.key} className="border-b border-black/10 last:border-0 break-inside-avoid">
            {row.cells.map((cell, index) => (
              <td key={columns[index].id} className={cn("py-1.5 align-top break-words", ALIGN[columns[index].align])}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
