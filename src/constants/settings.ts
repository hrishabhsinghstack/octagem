import type { PermissionModule } from "@/types/rbac";
import { Boxes, Building, Database, Palette, Shield, User, Users, Workflow } from "lucide-react";

export const settingsMenuItems: { title: string; value: string; icon: typeof User; module?: PermissionModule }[] = [
  { title: "Profile", value: "profile", icon: User },
  { title: "Business", value: "business", icon: Building },
  { title: "Branding & Logo", value: "branding", icon: Palette },
  { title: "Inventory Catalog", value: "catalog", icon: Boxes, module: "catalog" },
  { title: "Master Data", value: "masterData", icon: Database, module: "catalog" },
  { title: "Workflow", value: "workflow", icon: Workflow },
  { title: "Users", value: "users", icon: Users, module: "usersRoles" },
  { title: "Roles & Permissions", value: "roles", icon: Shield, module: "usersRoles" },
];
