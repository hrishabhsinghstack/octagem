import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUser } from "@/lib/api/rbacApi";
import { showError, showSuccess } from "@/lib/utils";
import type { Role } from "@/types/rbac";
import { useEffect, useState } from "react";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  onCreated: () => void;
}

export function CreateUserDialog({ open, onOpenChange, roles, onCreated }: CreateUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPassword("");
      setRoleId((current) => current || roles[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6 || !roleId) {
      showError("Missing fields", "Name, email, a role, and a password of at least 6 characters are required.");
      return;
    }
    setSaving(true);
    try {
      const user = await createUser({ name: name.trim(), email: email.trim(), password, roleId });
      showSuccess("User created", `${user.name} can now sign in with the password you set.`);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      showError("Error", error?.message || "Could not create this user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>New user</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Full name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Temporary password *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" placeholder="At least 6 characters" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Role *</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
