import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "@/types/rbac";
import type { Role } from "@/types/rbac";

export const COMPANY_ADMIN_ROLE_ID = "ROLE-ADMIN";

export const mockRoles: Role[] = [
  {
    id: COMPANY_ADMIN_ROLE_ID,
    tenantId: "local",
    name: "Company Admin",
    description: "Full access to every module across the company. Always present, cannot be deleted.",
    isSystem: true,
    permissions: PERMISSION_MODULES.map((m) => ({ module: m.key, actions: [...PERMISSION_ACTIONS], scope: "company" })),
  },
];
