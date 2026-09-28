import { Button } from "@/components/ui/button";
import { listImportBatches, undoImport } from "@/lib/api/importApi";
import { formatRelativeTime, showError, showSuccess } from "@/lib/utils";
import type { ImportBatch } from "@/types/importBatch";
import { Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Recent imports with one-click undo. `onUndone` lets the page refresh its list. */
export function ImportHistory({ onUndone, limit = 5 }: { onUndone: () => void; limit?: number }) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => listImportBatches().then((all) => setBatches(all.slice(0, limit)));
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = async (batch: ImportBatch) => {
    const total = batch.createdIds.length + batch.updated.length;
    if (!window.confirm(`Undo ${batch.id}? ${batch.createdIds.length} added item(s) are removed and ${batch.updated.length} updated item(s) restored. Items changed since the import are left as they are.`)) return;
    setBusy(batch.id);
    try {
      const undone = await undoImport(batch.id);
      const kept = undone.undoSkipped?.length ?? 0;
      showSuccess("Import undone", kept ? `${total - kept} reversed. Left as is (changed since): ${undone.undoSkipped!.join(", ")}.` : `All ${total} changes reversed.`);
      refresh();
      onUndone();
    } catch (error: any) {
      showError("Could not undo", error?.message);
    } finally {
      setBusy(null);
    }
  };

  if (batches.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent imports</p>
      <div className="border rounded-md divide-y">
        {batches.map((batch) => (
          <div key={batch.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="flex-1 min-w-0">
              <p className="truncate">
                <span className="font-medium">{batch.id}</span> · {batch.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(batch.importedAt)} · {batch.createdIds.length} added · {batch.updated.length} updated
                {batch.skippedRows > 0 && ` · ${batch.skippedRows} skipped`}
              </p>
            </div>
            {batch.undoneAt ? (
              <span className="text-xs text-muted-foreground">Undone</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => undo(batch)} disabled={busy === batch.id} className="h-7 text-xs">
                <Undo2 className="h-3 w-3 mr-1" /> Undo
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
