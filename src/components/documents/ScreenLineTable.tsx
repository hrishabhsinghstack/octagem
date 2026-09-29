import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RenderedColumn, RenderedRow } from "@/lib/document/renderDocument";
import { cn } from "@/lib/utils";

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/**
 * The on-screen twin of PrintLineTable: the same resolved columns and rows, rendered with the app's
 * themed table primitives.
 *
 * The model is shared, the markup deliberately is not — the printed table is bare black-on-white for
 * paper, and forcing one of the two to adopt the other's styling would make it wrong somewhere. Sharing
 * the resolved columns is what stops the screen and the document disagreeing, which is the actual
 * requirement.
 */
export function ScreenLineTable({ columns, rows, emptyMessage = "No lines." }: { columns: RenderedColumn[]; rows: RenderedRow[]; emptyMessage?: string }) {
  if (columns.length === 0) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} className={ALIGN[column.align]}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            {row.cells.map((cell, index) => (
              <TableCell key={columns[index].id} className={cn(ALIGN[columns[index].align], columns[index].align === "right" && "tabular-nums")}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
