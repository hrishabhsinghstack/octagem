import { getPath, isBlank, type DateOrder } from "@/lib/inventory/fieldValues";
import type { CategoryDefinition, FieldDefinition, FieldType } from "@/types/catalog";
import type { InventoryItem } from "@/types/inventory";

/**
 * What the import template and the export look like, decided from the catalog — pure, so it is
 * tested without Excel. The template and the export share this shape on purpose: export → edit in
 * Excel → import back is a supported round trip.
 */

export interface SheetColumn {
  fieldKey: string;
  header: string;
  required: boolean;
  type: FieldType;
  /** Id of the dropdown list feeding this column, if any. */
  listId?: string;
  /** Strict lists reject other values in Excel; open lists only warn. */
  strict: boolean;
  /** Shown as the header cell's note — what goes in the column. */
  note: string;
  width: number;
}

export interface SheetSpec {
  name: string;
  categoryKey: string;
  columns: SheetColumn[];
}

export interface ListSpec {
  id: string;
  title: string;
  values: string[];
}

export interface WorkbookSpec {
  sheets: SheetSpec[];
  lists: ListSpec[];
  instructions: string[][];
}

/** Sheet names used by the template itself — skipped when a workbook is read back. */
export const INSTRUCTIONS_SHEET = "Instructions";
export const LISTS_SHEET = "Lists";

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ]. */
export function sheetName(label: string): string {
  return label.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
}

/** "Carat (ct) *" — the unit is skipped when the label already says it ("Depth %"). */
export function headerFor(field: FieldDefinition): string {
  const unit = field.unit && !field.label.includes(field.unit) ? ` (${field.unit})` : "";
  return `${field.label}${unit}${field.required ? " *" : ""}`;
}

function noteFor(field: FieldDefinition, dateOrder: DateOrder, hasList: boolean): string {
  const lines: string[] = [];
  if (field.help) lines.push(field.help);
  if (field.required && field.key !== "code") lines.push("Required.");
  if (field.key === "code") lines.push("Leave blank to number automatically.");
  switch (field.type) {
    case "number":
    case "integer": {
      const range = [field.min !== undefined && `at least ${field.min}`, field.max !== undefined && `at most ${field.max}`].filter(Boolean).join(", ");
      lines.push(`${field.type === "integer" ? "Whole number" : "Number"}${field.decimals !== undefined ? `, up to ${field.decimals} decimals` : ""}${range ? `, ${range}` : ""}.`);
      break;
    }
    case "date":
      lines.push(`Date — ${dateOrder === "DMY" ? "DD/MM/YYYY" : "MM/DD/YYYY"} or YYYY-MM-DD.`);
      break;
    case "boolean":
      lines.push("Yes or No.");
      break;
    case "multiselect":
      lines.push("One or more values from the list, separated by commas.");
      break;
    case "select":
      if (hasList) lines.push(field.listMode === "open" ? "Pick from the list or type your own." : "Pick from the list.");
      if (field.allowRange) lines.push('Ranges like "G-H" are accepted.');
      break;
  }
  if (field.unique) lines.push(field.unique === "always" ? "Must be unique." : "Must be unique among stock on hand.");
  return lines.join("\n");
}

export interface WorkbookSpecInput {
  categories: CategoryDefinition[];
  fieldsFor: (categoryKey: string) => FieldDefinition[];
  /** Every value a dropdown may offer — for scoped lists (karat), all of them, not just one metal's. */
  listValues: (field: FieldDefinition, category: CategoryDefinition) => string[];
  dateOrder: DateOrder;
  companyName?: string;
}

export function buildWorkbookSpec(input: WorkbookSpecInput): WorkbookSpec {
  const lists: ListSpec[] = [];
  const listIdByValues = new Map<string, string>();
  const listFor = (title: string, values: string[]): string | undefined => {
    if (values.length === 0) return undefined;
    const signature = JSON.stringify(values);
    let id = listIdByValues.get(signature);
    if (!id) {
      id = `L${lists.length + 1}`;
      lists.push({ id, title, values });
      listIdByValues.set(signature, id);
    }
    return id;
  };

  const sheets: SheetSpec[] = input.categories.map((category) => {
    const fields = input
      .fieldsFor(category.key)
      // A category with one counting method needs no column for it.
      .filter((f) => !(f.key === "identityModel" && category.allowedIdentityModels.length <= 1));
    const columns = fields.map((field): SheetColumn => {
      const values = field.type === "boolean" ? ["Yes", "No"] : field.type === "select" || field.type === "multiselect" ? input.listValues(field, category) : [];
      // Excel can't validate comma-separated multi-values against a list, so multi-select columns get the list as a note only.
      const listId = field.type === "multiselect" ? undefined : listFor(field.label, values);
      // Stock number is required on an item, but optional in a sheet: import numbers blank rows itself.
      const required = field.required && field.key !== "code";
      const header = headerFor({ ...field, required });
      return {
        fieldKey: field.key,
        header,
        required,
        type: field.type,
        listId,
        strict: field.type === "boolean" || field.listMode !== "open",
        note: noteFor(field, input.dateOrder, Boolean(listId)) + (field.type === "multiselect" && values.length ? `\nValues: ${values.join(", ")}` : ""),
        width: Math.min(40, Math.max(12, header.length + 3)),
      };
    });
    return { name: sheetName(category.label), categoryKey: category.key, columns };
  });

  const instructions = [
    [`${input.companyName ? `${input.companyName} — ` : ""}inventory import template`],
    [],
    ["How to use"],
    ["1. Fill one row per item on the sheet for its category. Delete sheets you don't need."],
    ["2. Columns marked * are required. Hover a header to see what it expects."],
    ["3. Leave Stock number blank to number items automatically."],
    ["4. Dropdown columns come from your master data — pick a value, or type it exactly."],
    [`5. Dates: ${input.dateOrder === "DMY" ? "DD/MM/YYYY" : "MM/DD/YYYY"} or YYYY-MM-DD. Numbers may include commas and currency symbols.`],
    ["6. To change existing items, keep their Stock number and choose \"Update existing\" when importing — blank cells leave values unchanged."],
    [],
    ["Sheets"],
    ...sheets.map((s) => [s.name, `${s.columns.length} columns, ${s.columns.filter((c) => c.required).length} required`]),
  ];

  return { sheets, lists, instructions };
}

/** One item as a template row — the export side of the round trip. Dates become UTC Date cells. */
export function itemToRow(item: InventoryItem, sheet: SheetSpec, fieldsByKey: Map<string, FieldDefinition>): unknown[] {
  return sheet.columns.map((column) => {
    const field = fieldsByKey.get(column.fieldKey);
    if (!field) return null;
    const value = getPath(item, field.path);
    if (isBlank(value)) return null;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (field.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
    return value;
  });
}
