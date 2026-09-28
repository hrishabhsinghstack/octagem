import { categoryIcon } from "@/components/catalog/categoryIcons";
import { CategoryEditorDialog } from "@/components/settings/catalog/CategoryEditorDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { countItemsByCategory, deleteCategory, listCategories, suggestStockNumber, updateCategory } from "@/lib/api/catalogApi";
import { showError, showSuccess } from "@/lib/utils";
import type { CategoryDefinition } from "@/types/catalog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const MODEL_LABEL = { UNIQUE: "Unique", LOT: "Lot", QUANTITY: "Quantity" } as const;
const UNIT_LABEL = { ct: "Carats", g: "Grams", none: "Not weighed" } as const;

export function CategoriesPanel({ onChanged }: { onChanged: () => void }) {
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nextNumbers, setNextNumbers] = useState<Record<string, string>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDefinition | null>(null);

  const refresh = async () => {
    const [all, itemCounts] = await Promise.all([listCategories(false), countItemsByCategory()]);
    setCategories(all);
    setCounts(itemCounts);
    const numbers = await Promise.all(all.map(async (c) => [c.key, await suggestStockNumber(c.key)] as const));
    setNextNumbers(Object.fromEntries(numbers));
  };

  useEffect(() => {
    refresh();
  }, []);

  const changed = () => {
    refresh();
    onChanged();
  };

  const toggleActive = async (category: CategoryDefinition, active: boolean) => {
    if (!active && categories.filter((c) => c.active).length === 1) {
      showError("Keep one category", "At least one category must stay active to receive stock.");
      return;
    }
    await updateCategory(category.key, { active });
    changed();
  };

  const handleDelete = async (category: CategoryDefinition) => {
    if (!window.confirm(`Delete ${category.label}? Fields that only this category used are deleted too.`)) return;
    try {
      await deleteCategory(category.key);
      showSuccess("Deleted", `${category.label} removed.`);
      changed();
    } catch (error: any) {
      showError("Could not delete", error?.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          What your business stocks. Each category has its own stock-number series, counting method and fields. A category that holds stock can be switched off but not deleted.
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> New category
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {categories.map((category) => {
          const Icon = categoryIcon(category.icon);
          const count = counts[category.key] ?? 0;
          return (
            <div key={category.key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-background shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {category.label}
                  {category.builtIn && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Built-in
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Next {nextNumbers[category.key] ?? "…"} · {category.allowedIdentityModels.map((m) => MODEL_LABEL[m]).join(", ")} · {UNIT_LABEL[category.weightUnit]} · {count} item{count === 1 ? "" : "s"}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={category.active} onCheckedChange={(checked) => toggleActive(category, checked)} /> Active
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing(category);
                  setEditorOpen(true);
                }}
                className="h-7 w-7 shrink-0"
                aria-label={`Edit ${category.label}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(category)}
                disabled={category.builtIn || count > 0}
                title={category.builtIn ? "Built-in categories can be switched off, not deleted" : count > 0 ? "Holds stock — switch it off instead" : undefined}
                className="h-7 w-7 shrink-0"
                aria-label={`Delete ${category.label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <CategoryEditorDialog open={editorOpen} onOpenChange={setEditorOpen} category={editing} onSaved={changed} />
    </div>
  );
}
