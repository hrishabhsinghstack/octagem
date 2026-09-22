import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CreateUserDialog } from "@/components/settings/CreateUserDialog";
import { useAuth } from "@/contexts/authContext";
import { listRoles, listUsers, setUserActive, updateUser } from "@/lib/api/rbacApi";
import { showSuccess } from "@/lib/utils";
import type { Role, User } from "@/types/rbac";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

export function UsersSettings() {
  const { session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listUsers().then(setUsers);
    listRoles().then(setRoles);
  };
  useEffect(refresh, []);

  const rolesById = Object.fromEntries(roles.map((r) => [r.id, r]));

  const handleRoleChange = async (user: User, roleId: string) => {
    await updateUser(user.id, { roleId });
    showSuccess("Updated", `${user.name}'s role changed.`);
    refresh();
  };

  const handleActiveToggle = async (user: User, active: boolean) => {
    await setUserActive(user.id, active);
    showSuccess("Updated", `${user.name} ${active ? "reactivated" : "deactivated"}.`);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Users</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Everyone who can sign in to this company, and which role they hold.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New user
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {users.map((user) => {
          const isSelf = user.id === session?.userId;
          const role = rolesById[user.roleId];
          return (
            <div key={user.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              {role?.isSystem ? (
                <Badge variant="outline">{role.name}</Badge>
              ) : (
                <Select value={user.roleId} onValueChange={(v) => handleRoleChange(user, v)} disabled={isSelf}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={user.active} onCheckedChange={(checked) => handleActiveToggle(user, checked)} disabled={isSelf} /> Active
              </label>
            </div>
          );
        })}
        {users.length === 0 && <p className="text-sm text-muted-foreground px-3 py-6 text-center">No users yet.</p>}
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} roles={roles} onCreated={refresh} />
    </div>
  );
}
