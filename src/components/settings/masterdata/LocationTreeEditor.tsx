import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { addLocationNode, deleteLocationNode, getLocationTree, updateLocationNode } from "@/lib/store/masterDataStore";
import { cn, showSuccess } from "@/lib/utils";
import type { LocationNode } from "@/types/masterData";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface TreeRow {
  node: LocationNode;
  depth: number;
}

function flatten(nodes: LocationNode[], collapsed: Set<string>, parentId: string | null = null, depth = 0): TreeRow[] {
  const rows: TreeRow[] = [];
  const children = nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const child of children) {
    rows.push({ node: child, depth });
    if (!collapsed.has(child.id)) {
      rows.push(...flatten(nodes, collapsed, child.id, depth + 1));
    }
  }
  return rows;
}

export function LocationTreeEditor() {
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const refresh = () => setNodes(getLocationTree());

  useEffect(() => {
    refresh();
  }, []);

  const hasChildren = (id: string) => nodes.some((n) => n.parentId === id);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const startAdd = (parentId: string | null) => {
    setAddingUnder(parentId);
    setIsAdding(true);
    setNewLabel("");
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setNewLabel("");
  };

  const confirmAdd = () => {
    if (!newLabel.trim()) return;
    addLocationNode(addingUnder, newLabel.trim());
    setIsAdding(false);
    setNewLabel("");
    refresh();
    showSuccess("Added", "Location added.");
  };

  const startEdit = (node: LocationNode) => {
    setEditingId(node.id);
    setEditLabel(node.label);
  };

  const confirmEdit = () => {
    if (editingId && editLabel.trim()) {
      updateLocationNode(editingId, { label: editLabel.trim() });
      refresh();
    }
    setEditingId(null);
  };

  const toggleActive = (node: LocationNode) => {
    updateLocationNode(node.id, { active: !node.active });
    refresh();
  };

  const remove = (node: LocationNode) => {
    if (hasChildren(node.id) && !window.confirm(`"${node.label}" has sub-locations. Delete it and everything under it?`)) return;
    deleteLocationNode(node.id);
    refresh();
  };

  const rows = flatten(nodes, collapsed);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Locations</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Branch → Vault/Locker → Cabinet → Tray → Box. Items pick a leaf node.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => startAdd(null)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add branch
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {rows.map(({ node, depth }) => (
          <div key={node.id} className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: `${12 + depth * 20}px` }}>
            <button type="button" onClick={() => toggleCollapsed(node.id)} className={cn("h-5 w-5 flex items-center justify-center shrink-0", !hasChildren(node.id) && "invisible")}>
              {collapsed.has(node.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {editingId === node.id ? (
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
                onBlur={confirmEdit}
                autoFocus
                className="h-7 text-sm flex-1"
              />
            ) : (
              <span className={cn("text-sm flex-1", !node.active && "text-muted-foreground line-through")}>{node.label}</span>
            )}

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <Switch checked={node.active} onCheckedChange={() => toggleActive(node)} />
            </label>
            <Button variant="ghost" size="icon" onClick={() => startEdit(node)} className="h-7 w-7 shrink-0">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => startAdd(node.id)} className="h-7 w-7 shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(node)} className="h-7 w-7 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground px-3 py-6 text-center">No locations yet.</p>}
      </div>

      {isAdding && (
        <div className="flex gap-2 items-center rounded-md border border-dashed p-2">
          <span className="text-xs text-muted-foreground shrink-0 pl-1">{addingUnder ? "Adding under a location:" : "Adding a new branch:"}</span>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New location name" onKeyDown={(e) => e.key === "Enter" && confirmAdd()} autoFocus className="h-8" />
          <Button size="sm" onClick={confirmAdd}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelAdd}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
