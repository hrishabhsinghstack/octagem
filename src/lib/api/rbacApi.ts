import * as roleStore from "@/lib/store/roleStore";
import * as userStore from "@/lib/store/userStore";
import type { ModulePermission, Role, User } from "@/types/rbac";

export async function listRoles(): Promise<Role[]> {
  return [...roleStore.getAll()];
}

export async function getRole(id: string): Promise<Role | undefined> {
  return roleStore.getById(id);
}

export interface CreateRolePayload {
  name: string;
  description: string;
  permissions: ModulePermission[];
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  const role: Role = {
    id: roleStore.nextRoleId(),
    tenantId: "local",
    name: payload.name,
    description: payload.description,
    isSystem: false,
    permissions: payload.permissions,
  };
  return roleStore.insert(role);
}

export async function updateRole(id: string, patch: Partial<Pick<Role, "name" | "description" | "permissions">>): Promise<Role | undefined> {
  const role = roleStore.getById(id);
  if (role?.isSystem) throw new Error("Company Admin's permissions cannot be changed.");
  return roleStore.update(id, patch);
}

export async function deleteRole(id: string): Promise<void> {
  const role = roleStore.getById(id);
  if (role?.isSystem) throw new Error("Company Admin cannot be deleted.");
  const inUse = userStore.getAll().some((u) => u.roleId === id);
  if (inUse) throw new Error("This role is still assigned to at least one user — reassign them first.");
  roleStore.remove(id);
}

export async function listUsers(): Promise<User[]> {
  return [...userStore.getAll()];
}

export async function getUser(id: string): Promise<User | undefined> {
  return userStore.getById(id);
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  roleId: string;
  branchId?: string;
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  if (userStore.findByEmail(payload.email)) {
    throw new Error("A user with this email already exists.");
  }
  const user: User = {
    id: userStore.nextUserId(),
    tenantId: "local",
    name: payload.name,
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    roleId: payload.roleId,
    branchId: payload.branchId,
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  return userStore.insert(user);
}

export async function updateUser(id: string, patch: Partial<Pick<User, "name" | "roleId" | "branchId" | "active">>): Promise<User | undefined> {
  return userStore.update(id, patch);
}

export async function setUserActive(id: string, active: boolean): Promise<User | undefined> {
  return userStore.update(id, { active });
}
