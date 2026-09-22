import { mockRoles } from "@/data/mockRoles";
import type { Role } from "@/types/rbac";

const STORAGE_KEY = "octagem.roles.local";

function readAll(): Role[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Role[];
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
