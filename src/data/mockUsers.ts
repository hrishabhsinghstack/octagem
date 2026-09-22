import { COMPANY_ADMIN_ROLE_ID } from "@/data/mockRoles";
import type { User } from "@/types/rbac";

export const mockUsers: User[] = [
  {
    id: "USER-1",
    tenantId: "local",
    name: "Jordan Miller",
    email: "jordan@octagem.demo",
    password: "octagem123",
    roleId: COMPANY_ADMIN_ROLE_ID,
    active: true,
    createdAt: "2026-01-01",
  },
];
