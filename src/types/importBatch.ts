import type { InventoryItem } from "@/types/inventory";

/**
 * One committed spreadsheet import — enough to undo it. Update snapshots omit media (photos are
 * large and an import never changes them), so undo restores fields and keeps the current photos.
 */
export interface ImportBatch {
  id: string;
  fileName: string;
  importedAt: string;
  actor: string;
  mode: "create" | "upsert";
  createdIds: string[];
  updated: { id: string; before: Omit<InventoryItem, "media"> }[];
  /** Rows the plan held back (errors) when importing valid rows only. */
  skippedRows: number;
  undoneAt?: string;
  /** Items that could not be undone because they changed after the import. */
  undoSkipped?: string[];
}
