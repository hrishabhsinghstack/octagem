import { BUILT_IN_TEMPLATES, builtInTemplate, builtInTemplatesFor } from "@/lib/document/builtInTemplates";
import { normaliseToken } from "@/lib/inventory/fieldValues";
import * as store from "@/lib/store/documentTemplateStore";
import type { DocumentKind, DocumentTemplate, TemplateColumn } from "@/types/documentTemplate";

/** Thrown with a message meant for the user — the Settings UI shows it verbatim. */
export class DocumentTemplateError extends Error {}

/**
 * How many columns each orientation can carry before the printed table stops being readable. A4 portrait
 * leaves ~186mm of usable width; at nine columns a money cell is under 20mm, which wraps "USD 9,400.00"
 * mid-number. The renderer also clamps widths to a floor, so this is the hard stop to that soft guard.
 */
const MAX_COLUMNS = { portrait: 8, landscape: 12 } as const;

export function columnLimit(landscape: boolean): number {
  return landscape ? MAX_COLUMNS.landscape : MAX_COLUMNS.portrait;
}

function findBuiltIn(id: string): DocumentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.id === id);
}

/* ------------------------------------------------------------------ reads */

/** Built-ins first, then the tenant's own by name — the order the picker and Settings both show. */
export async function listTemplates(kind: DocumentKind, includeHidden = false): Promise<DocumentTemplate[]> {
  const builtIns = builtInTemplatesFor(kind).filter((template) => includeHidden || !store.isHidden(template.id));
  const tenant = [...store.getTenantTemplates(kind)].sort((a, b) => a.name.localeCompare(b.name));
  return [...builtIns, ...tenant];
}

export async function getTemplate(id: string): Promise<DocumentTemplate | undefined> {
  return findBuiltIn(id) ?? store.getTenantTemplate(id);
}

/** Only built-ins can be hidden; a tenant template is deleted instead, so this is always false for those. */
export function isTemplateHidden(id: string): boolean {
  return store.isHidden(id);
}

/**
 * The template a document should print with, via three links: the id stamped on the document, then the
 * tenant's default for that kind, then the built-in starter. Nothing ever renders with no template, which
 * is what makes the whole feature need no migration — an invoice saved before templates existed simply
 * falls through to the last link.
 */
export async function resolveTemplateFor(kind: DocumentKind, templateId?: string): Promise<DocumentTemplate> {
  if (templateId) {
    const stamped = await getTemplate(templateId);
    if (stamped) return stamped;
  }
  const defaultId = store.getDefaultId(kind);
  if (defaultId) {
    const preferred = await getTemplate(defaultId);
    if (preferred) return preferred;
  }
  return builtInTemplate(kind);
}

export async function getDefaultTemplateId(kind: DocumentKind): Promise<string> {
  const resolved = await resolveTemplateFor(kind);
  return resolved.id;
}

export function isDefaultTemplate(kind: DocumentKind, id: string): boolean {
  const explicit = store.getDefaultId(kind);
  // With no explicit default the built-in starter is what everything actually uses, so it is the default.
  return explicit ? explicit === id : builtInTemplate(kind).id === id;
}

/* ------------------------------------------------------------------ validation */

function assertNameFree(kind: DocumentKind, name: string, exceptId?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new DocumentTemplateError("Give the template a name.");
  const token = normaliseToken(trimmed);
  const clash = [...builtInTemplatesFor(kind), ...store.getTenantTemplates(kind)].some(
    (template) => template.id !== exceptId && normaliseToken(template.name) === token
  );
  if (clash) throw new DocumentTemplateError(`A ${kind} template called “${trimmed}” already exists.`);
}

/** Money column = something the customer can add up. A template printing no amounts is not an invoice. */
function hasMoneyColumn(columns: TemplateColumn[]): boolean {
  return columns.some(
    (column) => column.enabled && column.source.kind === "line" && (column.source.field === "lineTotal" || column.source.field === "unitPrice")
  );
}

function assertValid(template: DocumentTemplate) {
  const enabled = template.columns.filter((column) => column.enabled);
  if (enabled.length === 0) throw new DocumentTemplateError("A template needs at least one column switched on.");
  if (!hasMoneyColumn(template.columns)) throw new DocumentTemplateError("Add a Total or Unit price column — a document with no amounts cannot be sent to a customer.");

  const limit = columnLimit(template.options.landscape);
  if (enabled.length > limit) {
    throw new DocumentTemplateError(
      template.options.landscape
        ? `${enabled.length} columns is more than landscape can print legibly (max ${limit}). Switch some off.`
        : `${enabled.length} columns is more than A4 portrait can print legibly (max ${limit}). Switch to landscape, or switch some columns off.`
    );
  }

  const ids = template.columns.map((column) => column.id);
  if (new Set(ids).size !== ids.length) throw new DocumentTemplateError("Two columns share an id — duplicate the template again to repair it.");

  for (const column of template.columns) {
    if (!Number.isFinite(column.widthWeight) || column.widthWeight <= 0 || column.widthWeight > 12) {
      throw new DocumentTemplateError("Column width must be between 1 and 12.");
    }
  }
}

/* ------------------------------------------------------------------ writes */

/** Fresh ids so a duplicate never shares column ids with its source — diagnostics key off them. */
function recolumn(columns: TemplateColumn[]): TemplateColumn[] {
  return columns.map((column, index) => ({ ...column, id: `c${index + 1}-${crypto.randomUUID().slice(0, 8)}` }));
}

export interface CreateTemplatePayload {
  kind: DocumentKind;
  name: string;
  /** Copy this template's columns, totals, blocks and options. Omit for a minimal starter. */
  fromId?: string;
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<DocumentTemplate> {
  assertNameFree(payload.kind, payload.name);
  const source = payload.fromId ? await getTemplate(payload.fromId) : builtInTemplate(payload.kind);
  if (!source) throw new DocumentTemplateError("The template being copied no longer exists.");

  const template: DocumentTemplate = {
    ...structuredClone(source),
    id: store.nextTemplateId(),
    name: payload.name.trim(),
    kind: payload.kind,
    builtIn: false,
    columns: recolumn(source.columns),
    updatedAt: new Date().toISOString(),
  };
  assertValid(template);
  return store.upsert(template);
}

export async function updateTemplate(id: string, patch: Partial<Omit<DocumentTemplate, "id" | "builtIn" | "kind">>): Promise<DocumentTemplate> {
  if (findBuiltIn(id)) throw new DocumentTemplateError("Built-in templates can't be edited. Duplicate it to make your own version.");

  const existing = store.getTenantTemplate(id);
  if (!existing) throw new DocumentTemplateError("This template no longer exists.");

  if (patch.name !== undefined) assertNameFree(existing.kind, patch.name, id);

  const next: DocumentTemplate = { ...existing, ...patch, name: (patch.name ?? existing.name).trim(), updatedAt: new Date().toISOString() };
  assertValid(next);
  return store.upsert(next);
}

export async function deleteTemplate(id: string): Promise<void> {
  if (findBuiltIn(id)) throw new DocumentTemplateError("Built-in templates can't be deleted. Hide it instead if you don't want it offered.");
  if (!store.getTenantTemplate(id)) return;
  store.remove(id);
}

export async function setDefaultTemplate(kind: DocumentKind, id: string): Promise<void> {
  const template = await getTemplate(id);
  if (!template) throw new DocumentTemplateError("This template no longer exists.");
  if (template.kind !== kind) throw new DocumentTemplateError(`That template is for ${template.kind}s, not ${kind}s.`);
  store.setDefaultId(kind, id);
}

/** Hiding a built-in keeps it out of the picker without deleting anything — mirrors deactivating a category. */
export async function setTemplateHidden(id: string, hidden: boolean): Promise<void> {
  const builtIn = findBuiltIn(id);
  if (!builtIn) throw new DocumentTemplateError("Only built-in templates can be hidden. Delete your own templates instead.");
  if (hidden && isDefaultTemplate(builtIn.kind, id)) {
    throw new DocumentTemplateError("This is the default template. Make another one the default before hiding it.");
  }
  store.setHidden(id, hidden);
}
