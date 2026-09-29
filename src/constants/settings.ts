import type { PermissionModule } from "@/types/rbac";
import { Boxes, Building, Database, FileText, Palette, Shield, User, Users, Workflow } from "lucide-react";

export const settingsMenuItems: { title: string; value: string; icon: typeof User; module?: PermissionModule }[] = [
  { title: "Profile", value: "profile", icon: User },
  { title: "Business", value: "business", icon: Building },
  { title: "Branding & Logo", value: "branding", icon: Palette },
  // Gated on `invoices` rather than `catalog`: this is a sales-document concern, and PERMISSION_ACTIONS
  // already carries "print" for exactly this kind of thing.
  { title: "Document Templates", value: "documentTemplates", icon: FileText, module: "invoices" },
  { title: "Inventory Catalog", value: "catalog", icon: Boxes, module: "catalog" },
  { title: "Master Data", value: "masterData", icon: Database, module: "catalog" },
  { title: "Workflow", value: "workflow", icon: Workflow },
  { title: "Users", value: "users", icon: Users, module: "usersRoles" },
  { title: "Roles & Permissions", value: "roles", icon: Shield, module: "usersRoles" },
];
