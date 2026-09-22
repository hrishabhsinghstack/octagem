import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleEditor } from "@/components/settings/rbac/RoleEditor";
import { cn, showError, showSuccess } from "@/lib/utils";
import { createRole, deleteRole, listRoles, updateRole } from "@/lib/api/rbacApi";
import type { Role } from "@/types/rbac";
import { Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function RolesSettings() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = (keepSelection = true) => {
    listRoles().then((list) => {
      setRoles(list);
      if (!keepSelection || !list.some((r) => r.id === selectedId)) {
        setSelectedId(list[0]?.id ?? null);
      }
    });
  };
  useEffect(() => refresh(false), []);

  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;

  const handleNewRole = async () => {
    const role = await createRole({ name: "New role", description: "", permissions: [] });
    showSuccess("Role created", "Configure its permissions below.");
    refresh();
    setSelectedId(role.id);
  };

  const handleSave = async (payload: { name: string; description: string; permissions: Role["permissions"] }) => {
    if (!selectedRole) return;
    await updateRole(selectedRole.id, payload);
    refresh();
  };

  const handleDelete = async () => {
    if (!selectedRole) return;
    if (!window.confirm(`Delete ${selectedRole.name}? Users on this role must be reassigned first.`)) return;
    try {
      await deleteRole(selectedRole.id);
      showSuccess("Deleted", `${selectedRole.name} removed.`);
      refresh(false);
    } catch (error: any) {
      showError("Error", error?.message || "Could not delete this role.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Roles &amp; Permissions</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Build the roles your company actually uses — each one is a bundle of module permissions and a data-visibility scope.</p>
        </div>
        <Button onClick={handleNewRole}>
          <Plus className="h-4 w-4 mr-2" /> New role
        </Button>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-6">
        <div className="border rounded-md divide-y">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedId(role.id)}
              className={cn("w-full text-left px-3 py-2.5 text-sm flex items-center gap-2", role.id === selectedId ? "bg-muted font-medium" : "hover:bg-muted/50")}
            >
              {role.isSystem && <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <span className="truncate flex-1">{role.name}</span>
              {role.isSystem && (
                <Badge variant="outline" className="text-[10px] px-1">
                  System
                </Badge>
              )}
            </button>
          ))}
        </div>

        <RoleEditor role={selectedRole} onSave={handleSave} onDelete={handleDelete} />
      </div>
    </div>
  );
}
