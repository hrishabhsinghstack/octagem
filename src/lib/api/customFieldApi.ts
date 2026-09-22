import * as store from "@/lib/store/customFieldStore";
import type { CustomFieldDefinition, CustomFieldType } from "@/types/customField";
import type { InventoryCategory } from "@/types/inventory";

export async function listCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  return [...store.getAll()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface CreateCustomFieldPayload {
  label: string;
  type: CustomFieldType;
  options?: string[];
  appliesTo: InventoryCategory | "All";
  required: boolean;
}

export async function createCustomFieldDefinition(payload: CreateCustomFieldPayload): Promise<CustomFieldDefinition> {
  const definitions = store.getAll();
  const definition: CustomFieldDefinition = {
    id: store.nextCustomFieldId(),
    tenantId: "local",
    label: payload.label,
    type: payload.type,
    options: payload.type === "dropdown" ? payload.options ?? [] : undefined,
    appliesTo: payload.appliesTo,
    required: payload.required,
    active: true,
    sortOrder: definitions.length,
  };
  return store.insert(definition);
}

export async function updateCustomFieldDefinition(id: string, patch: Partial<Omit<CustomFieldDefinition, "id" | "tenantId">>): Promise<CustomFieldDefinition | undefined> {
  return store.update(id, patch);
}

export async function deleteCustomFieldDefinition(id: string): Promise<void> {
  store.remove(id);
}
