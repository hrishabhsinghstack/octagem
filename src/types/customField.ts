import type { InventoryCategory } from "@/types/inventory";

/**
 * Tenant-defined extra fields for Inventory items — the "same software, different businesses,
 * without changing the core software" escape hatch for anything OctaGem doesn't model out of the
 * box. Scoped to Inventory only for now; Customers/Vendors stay out until a real need shows up.
 */
export type CustomFieldType = "text" | "number" | "date" | "boolean" | "dropdown";

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  label: string;
  type: CustomFieldType;
  /** Only meaningful for type "dropdown". */
  options?: string[];
  /** "All" or scoped to one InventoryCategory — a business might want a field only on Watches. */
  appliesTo: InventoryCategory | "All";
  required: boolean;
  active: boolean;
  sortOrder: number;
}

export type CustomFieldValue = string | number | boolean;
