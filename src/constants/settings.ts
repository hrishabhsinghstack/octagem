import type { PermissionModule } from "@/types/rbac";
import { Building, Database, ListPlus, Palette, Shield, User, Users, Workflow } from "lucide-react";

export const settingsMenuItems: { title: string; value: string; icon: typeof User; module?: PermissionModule }[] = [
  { title: "Profile", value: "profile", icon: User },
  { title: "Business", value: "business", icon: Building },
  { title: "Branding & Logo", value: "branding", icon: Palette },
  { title: "Master Data", value: "masterData", icon: Database },
  { title: "Custom Fields", value: "customFields", icon: ListPlus },
  { title: "Workflow", value: "workflow", icon: Workflow },
  { title: "Users", value: "users", icon: Users, module: "usersRoles" },
  { title: "Roles & Permissions", value: "roles", icon: Shield, module: "usersRoles" },
];
