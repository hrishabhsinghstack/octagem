import type { CustomFieldDefinition } from "@/types/customField";

const STORAGE_KEY = "octagem.customFields.local";

function readAll(): CustomFieldDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CustomFieldDefinition[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  return [];
}

function writeAll(definitions: CustomFieldDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(definitions));
}

export function getAll(): CustomFieldDefinition[] {
  return readAll();
}

export function getById(id: string): CustomFieldDefinition | undefined {
  return readAll().find((d) => d.id === id);
}

export function insert(definition: CustomFieldDefinition): CustomFieldDefinition {
  const definitions = readAll();
  definitions.push(definition);
  writeAll(definitions);
  return definition;
}

export function update(id: string, patch: Partial<CustomFieldDefinition>): CustomFieldDefinition | undefined {
  const definitions = readAll();
  const index = definitions.findIndex((d) => d.id === id);
  if (index === -1) return undefined;
  definitions[index] = { ...definitions[index], ...patch };
  writeAll(definitions);
  return definitions[index];
}

export function remove(id: string) {
  writeAll(readAll().filter((d) => d.id !== id));
}

export function nextCustomFieldId(): string {
  const numbers = readAll()
    .map((d) => Number(d.id.replace("CF-", "")))
    .filter((n) => !Number.isNaN(n));
  return `CF-${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
}
