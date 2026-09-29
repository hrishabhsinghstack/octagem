import type { DocumentKind, DocumentTemplate, StoredTemplates } from "@/types/documentTemplate";

/**
 * localStorage-backed document templates. Built-in definitions live in code
 * (lib/document/builtInTemplates.ts) and are never stored — only the tenant's own templates, which
 * default id is chosen, and which built-ins are hidden from the picker.
 *
 * Unlike the catalog store, a tenant edit is NOT kept as a diff against a built-in: `columns` is an
 * ordered array and arrays do not merge sanely, so duplicating a built-in copies it outright.
 */
const STORAGE_KEY = "octagem.documentTemplates.local";

const seed = (): StoredTemplates => ({ templates: [], defaults: {}, hiddenBuiltIns: [] });

/** Fills in anything a newer release added, without touching tenant templates. */
function migrate(stored: Partial<StoredTemplates>): { data: StoredTemplates; changed: boolean } {
  let changed = false;
  const data: StoredTemplates = {
    templates: Array.isArray(stored.templates) ? stored.templates : ((changed = true), []),
    defaults: stored.defaults && typeof stored.defaults === "object" ? stored.defaults : ((changed = true), {}),
    hiddenBuiltIns: Array.isArray(stored.hiddenBuiltIns) ? stored.hiddenBuiltIns : ((changed = true), []),
  };
  return { data, changed };
}

function read(): StoredTemplates {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { data, changed } = migrate(JSON.parse(raw) as Partial<StoredTemplates>);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {
    // fall through to reseed
  }
  const fresh = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function write(data: StoredTemplates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getStored(): StoredTemplates {
  return read();
}

/** Tenant templates only — built-ins come from code, see documentTemplateApi.listTemplates. */
export function getTenantTemplates(kind?: DocumentKind): DocumentTemplate[] {
  const all = read().templates;
  return kind ? all.filter((template) => template.kind === kind) : all;
}

export function getTenantTemplate(id: string): DocumentTemplate | undefined {
  return read().templates.find((template) => template.id === id);
}

export function upsert(template: DocumentTemplate): DocumentTemplate {
  const data = read();
  const index = data.templates.findIndex((candidate) => candidate.id === template.id);
  if (index === -1) data.templates.push(template);
  else data.templates[index] = template;
  write(data);
  return template;
}

export function remove(id: string) {
  const data = read();
  data.templates = data.templates.filter((template) => template.id !== id);
  // A dangling default would silently fall back forever; clearing it makes the next save explicit.
  for (const [kind, defaultId] of Object.entries(data.defaults)) {
    if (defaultId === id) delete data.defaults[kind as DocumentKind];
  }
  write(data);
}

export function getDefaultId(kind: DocumentKind): string | undefined {
  return read().defaults[kind];
}

export function setDefaultId(kind: DocumentKind, id: string | undefined) {
  const data = read();
  if (id) data.defaults[kind] = id;
  else delete data.defaults[kind];
  write(data);
}

export function isHidden(id: string): boolean {
  return read().hiddenBuiltIns.includes(id);
}

export function setHidden(id: string, hidden: boolean) {
  const data = read();
  const already = data.hiddenBuiltIns.includes(id);
  if (hidden && !already) data.hiddenBuiltIns.push(id);
  if (!hidden && already) data.hiddenBuiltIns = data.hiddenBuiltIns.filter((candidate) => candidate !== id);
  write(data);
}

/** `tpl-4` style ids for tenant templates, so they never collide with the `builtin.*` literals. */
export function nextTemplateId(): string {
  const numbers = read()
    .templates.map((template) => Number(template.id.replace("tpl-", "")))
    .filter((value) => !Number.isNaN(value));
  return `tpl-${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
}
