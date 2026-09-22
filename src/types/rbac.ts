/**
 * §29.2 — Permission = (action, resource-type, scope). Roles are named, tenant-customizable bundles
 * of these, not hardcoded strings. Scope is set per module per role (not per individual action) —
 * simple enough for a real Role Editor UI while still matching the blueprint's model.
 */
export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "reject" | "cancel" | "export" | "print" | "import" | "convert";

export type PermissionModule =
  | "inventory"
  | "memoOut"
  | "memoIn"
  | "quotes"
  | "salesOrders"
  | "invoices"
  | "purchaseOrders"
  | "vendorBills"
  | "payments"
  | "customers"
  | "vendors"
  | "reports"
  | "usersRoles";

export const PERMISSION_MODULES: { key: PermissionModule; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "memoOut", label: "Memo Out" },
  { key: "memoIn", label: "Memo In" },
  { key: "quotes", label: "Quotes" },
  { key: "salesOrders", label: "Sales Orders" },
  { key: "invoices", label: "Invoices" },
  { key: "purchaseOrders", label: "Purchase Orders" },
  { key: "vendorBills", label: "Vendor Bills" },
  { key: "payments", label: "Payments" },
  { key: "customers", label: "Customers" },
  { key: "vendors", label: "Vendors" },
  { key: "reports", label: "Reports" },
  { key: "usersRoles", label: "Users & Roles" },
];

export const PERMISSION_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete", "approve", "reject", "cancel", "export", "print", "import", "convert"];

/** "team"/"branch"/"department" are accepted values now so the model and Role Editor are complete, but resolve like "company" (no filtering) until Branches/teams exist — see scopeFor() in authContext. */
export type DataScope = "own" | "team" | "branch" | "department" | "company";

export const DATA_SCOPES: { key: DataScope; label: string }[] = [
  { key: "own", label: "Own records" },
  { key: "team", label: "Team" },
  { key: "branch", label: "Branch" },
  { key: "department", label: "Department" },
  { key: "company", label: "All company records" },
];

export interface ModulePermission {
  module: PermissionModule;
  actions: PermissionAction[];
  scope: DataScope;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** True only for Company Admin — undeletable, always full access, seeded once per tenant. */
  isSystem: boolean;
  /** Modules not listed here are fully denied. */
  permissions: ModulePermission[];
}

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  /** Plaintext in this mock store — same caveat as the rest of the auth phase, not representative of real backend hashing. */
  password: string;
  roleId: string;
  /** For branch-scoped data visibility once Branches (a flagged future module) exists. */
  branchId?: string;
  active: boolean;
  createdAt: string;
}
