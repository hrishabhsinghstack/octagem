import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, showError, showSuccess } from "@/lib/utils";
import { DATA_SCOPES, PERMISSION_ACTIONS, PERMISSION_MODULES } from "@/types/rbac";
import type { ModulePermission, PermissionAction, PermissionModule, Role } from "@/types/rbac";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface RoleEditorProps {
  role: Role | null;
  onSave: (payload: { name: string; description: string; permissions: ModulePermission[] }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const DEFAULT_SCOPE = "company" as const;

export function RoleEditor({ role, onSave, onDelete }: RoleEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(role?.permissions ?? []);
  }, [role]);

  if (!role) {
    return <p className="text-sm text-muted-foreground px-1 py-8 text-center">Select a role on the left, or create a new one.</p>;
  }

  const readOnly = role.isSystem;
  const permissionFor = (module: PermissionModule) => permissions.find((p) => p.module === module);

  const toggleAction = (module: PermissionModule, action: PermissionAction) => {
    setPermissions((current) => {
      const existing = current.find((p) => p.module === module);
      if (!existing) {
        return [...current, { module, actions: [action], scope: DEFAULT_SCOPE }];
      }
      const hasAction = existing.actions.includes(action);
      const nextActions = hasAction ? existing.actions.filter((a) => a !== action) : [...existing.actions, action];
      if (nextActions.length === 0) {
        return current.filter((p) => p.module !== module);
      }
      return current.map((p) => (p.module === module ? { ...p, actions: nextActions } : p));
    });
  };

  const toggleAllActions = (module: PermissionModule) => {
    const existing = permissionFor(module);
    const allSelected = existing?.actions.length === PERMISSION_ACTIONS.length;
    setPermissions((current) => {
      if (allSelected) return current.filter((p) => p.module !== module);
      if (existing) return current.map((p) => (p.module === module ? { ...p, actions: [...PERMISSION_ACTIONS] } : p));
      return [...current, { module, actions: [...PERMISSION_ACTIONS], scope: DEFAULT_SCOPE }];
    });
  };

  const setScope = (module: PermissionModule, scope: ModulePermission["scope"]) => {
    setPermissions((current) => current.map((p) => (p.module === module ? { ...p, scope } : p)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError("Missing name", "Give this role a name.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), permissions });
      showSuccess("Saved", `${name.trim()} updated.`);
    } catch (error: any) {
      showError("Error", error?.message || "Could not save this role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Role name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" disabled={readOnly} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" disabled={readOnly} />
        </div>
      </div>

      {readOnly && <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">Company Admin always has full access and can't be edited or deleted.</p>}

      <div className="border rounded-md divide-y">
        {PERMISSION_MODULES.map((m) => {
          const existing = permissionFor(m.key);
          const allSelected = existing?.actions.length === PERMISSION_ACTIONS.length;
          return (
            <div key={m.key} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleAllActions(m.key)}
                  className={cn("text-sm font-medium text-left", !readOnly && "hover:underline", readOnly && "cursor-default")}
                >
                  {m.label}
                  {allSelected && <span className="text-xs text-muted-foreground font-normal"> · all</span>}
                </button>
                {existing && (
                  <Select value={existing.scope} onValueChange={(v) => setScope(m.key, v as ModulePermission["scope"])} disabled={readOnly}>
                    <SelectTrigger className="w-40 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_SCOPES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERMISSION_ACTIONS.map((action) => {
                  const active = existing?.actions.includes(action) ?? false;
                  return (
                    <button
                      key={action}
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleAction(m.key, action)}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs border capitalize transition-colors",
                        active ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted",
                        readOnly && "cursor-default opacity-70"
                      )}
                    >
                      {action}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between">
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete role
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save role"}
          </Button>
        </div>
      )}
    </div>
  );
}
