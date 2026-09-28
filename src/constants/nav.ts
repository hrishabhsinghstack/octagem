import type { PermissionModule } from "@/types/rbac";
import type { WorkflowSettings } from "@/types/settings";
import { BarChart3, Building2, CreditCard, Gem, Handshake, LayoutDashboard, PackageCheck, Receipt, ShoppingCart, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Gates this item's visibility via the signed-in role's "view" permission — omit only for module-less pages like the Dashboard. */
  module?: PermissionModule;
  /** Additionally gated by a Settings → Workflow toggle — omit for items every business always has. */
  workflowCheck?: (settings: WorkflowSettings) => boolean;
}

export interface NavGroup {
  title: string;
  children: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    title: "Overview",
    children: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    title: "Inventory",
    children: [{ title: "Inventory", url: "/inventory", icon: Gem, module: "inventory" }],
  },
  {
    title: "Purchasing",
    children: [
      { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart, module: "purchaseOrders" },
      { title: "Memo In", url: "/memo-in", icon: PackageCheck, module: "memoIn" },
      { title: "Vendor Bills", url: "/vendor-bills", icon: Receipt, module: "vendorBills" },
      { title: "Vendors", url: "/vendors", icon: Building2, module: "vendors" },
    ],
  },
  {
    title: "Sales",
    children: [
      { title: "Memo", url: "/memos", icon: Handshake, module: "memoOut" },
      { title: "Invoices", url: "/invoices", icon: Receipt, module: "invoices" },
      { title: "Customers", url: "/customers", icon: Users, module: "customers" },
    ],
  },
  {
    title: "Finance",
    children: [{ title: "Payments", url: "/payments", icon: CreditCard, module: "payments" }],
  },
  {
    title: "Reports",
    children: [{ title: "Reports", url: "/reports", icon: BarChart3, module: "reports" }],
  },
];
