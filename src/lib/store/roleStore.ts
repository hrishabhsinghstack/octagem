import { COMPANY_ADMIN_ROLE_ID, mockRoles } from "@/data/mockRoles";
import { PERMISSION_ACTIONS, PERMISSION_MODULES, type Role } from "@/types/rbac";

const STORAGE_KEY = "octagem.roles.local";

/**
 * Company Admin is "full access to every module" by definition, so a module added in a later
 * release (e.g. Catalog & Master Data) is granted to it on read. Other roles are left alone — a new
 * module starts denied until someone grants it in the Role Editor.
 */
function migrate(roles: Role[]): { roles: Role[]; changed: boolean } {
  let changed = false;
  const migrated = roles.map((role) => {
    if (role.id !== COMPANY_ADMIN_ROLE_ID) return role;
    const missing = PERMISSION_MODULES.filter((m) => !role.permissions.some((p) => p.module === m.key));
    if (missing.length === 0) return role;
    changed = true;
    return { ...role, permissions: [...role.permissions, ...missing.map((m) => ({ module: m.key, actions: [...PERMISSION_ACTIONS], scope: "company" as const }))] };
  });
  return { roles: migrated, changed };
}

function readAll(): Role[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { roles, changed } = migrate(JSON.parse(raw) as Role[]);
      if (changed) writeAll(roles);
      return roles;
    }
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockRoles));
  return mockRoles;
}

function writeAll(roles: Role[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
}

export function getAll(): Role[] {
  return readAll();
}

export function getById(id: string): Role | undefined {
  return readAll().find((r) => r.id === id);
}

export function insert(role: Role): Role {
  const roles = readAll();
  roles.push(role);
  writeAll(roles);
  return role;
}

export function update(id: string, patch: Partial<Role>): Role | undefined {
  const roles = readAll();
  const index = roles.findIndex((r) => r.id === id);
  if (index === -1) return undefined;
  roles[index] = { ...roles[index], ...patch };
  writeAll(roles);
  return roles[index];
}

export function remove(id: string) {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function nextRoleId(): string {
  const numbers = readAll()
    .map((r) => Number(r.id.replace("ROLE-", "")))
    .filter((n) => !Number.isNaN(n));
  return `ROLE-${(numbers.length ? Math.max(...numbers) : 100) + 1}`;
}
