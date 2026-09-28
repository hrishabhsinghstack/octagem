import ExcelJS from "exceljs";
import { parseDelimited } from "@/lib/inventory/importPlan";
import { INSTRUCTIONS_SHEET, LISTS_SHEET, type WorkbookSpec } from "@/lib/inventory/sheetSpec";

/**
 * Excel reading and writing (ExcelJS). Loaded on demand — import dynamically so the library only
 * downloads when someone imports or exports.
 */

export interface SheetData {
  name: string;
  rows: unknown[][];
}

const DATA_ROWS = 2000;

/**
 * ExcelJS 4.4 supports range-keyed validations at runtime (written as one sqref, so 2,000 rows cost
 * one XML element, not 2,000) but its typings omit the property.
 */
type WithRangeValidations = ExcelJS.Worksheet & { dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void } };

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** The import template (no data) or an export (with data), from one spec. */
export async function writeWorkbook(spec: WorkbookSpec, dataBySheet: Record<string, unknown[][]> = {}): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OctaGem";
  workbook.created = new Date();

  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET);
  spec.instructions.forEach((row) => instructions.addRow(row));
  instructions.getColumn(1).width = 90;
  instructions.getRow(1).font = { bold: true, size: 14 };
  [3, 11].forEach((r) => (instructions.getRow(r).font = { bold: true }));

  const listSheet = workbook.addWorksheet(LISTS_SHEET, { state: "hidden" });
  const listRange = new Map<string, string>();
  spec.lists.forEach((list, index) => {
    const column = columnLetter(index);
    listSheet.getCell(`${column}1`).value = list.title;
    list.values.forEach((value, row) => (listSheet.getCell(`${column}${row + 2}`).value = value));
    listRange.set(list.id, `'${LISTS_SHEET}'!$${column}$2:$${column}$${list.values.length + 1}`);
  });

  for (const sheet of spec.sheets) {
    const ws = workbook.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width }));
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle" };
    sheet.columns.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column.required ? "FFFDE68A" : "FFF1F5F9" } };
      if (column.note) cell.note = column.note;
      const range = `${columnLetter(index)}2:${columnLetter(index)}${DATA_ROWS + 1}`;
      const formula = column.listId ? listRange.get(column.listId) : undefined;
      if (formula) {
        (ws as WithRangeValidations).dataValidations.add(range, {
          type: "list",
          allowBlank: true,
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: column.strict ? "stop" : "information",
          errorTitle: column.header,
          error: column.strict ? "Pick a value from the list." : "Not in the list — it will be kept as typed.",
        });
      } else if (column.type === "date") {
        ws.getColumn(index + 1).numFmt = "yyyy-mm-dd";
      }
    });
    for (const row of dataBySheet[sheet.name] ?? []) ws.addRow(row);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== "object") return value;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("formula" in value || "sharedFormula" in value) return cellValue((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  if ("text" in value) return (value as ExcelJS.CellHyperlinkValue).text;
  if ("error" in value) return null;
  return String(value);
}

/**
 * Reads .xlsx sheets or a CSV/TSV file into plain rows. The template's own Instructions and Lists
 * sheets and any hidden sheet are skipped.
 */
export async function readSpreadsheet(data: ArrayBuffer, fileName: string): Promise<SheetData[]> {
  if (/\.(csv|tsv|txt)$/i.test(fileName)) {
    return [{ name: fileName.replace(/\.[^.]+$/, ""), rows: parseDelimited(new TextDecoder("utf-8").decode(data)) }];
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheets: SheetData[] = [];
  workbook.eachSheet((ws) => {
    if (ws.state !== "visible" || ws.name === INSTRUCTIONS_SHEET || ws.name === LISTS_SHEET) return;
    const rows: unknown[][] = [];
    const width = ws.columnCount;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      rows.push(Array.from({ length: width }, (_, c) => cellValue(row.getCell(c + 1).value)));
    }
    // Trailing empty rows (formatted but unused) are noise, not blank data.
    while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === null || cell === "")) rows.pop();
    if (rows.length > 0) sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

export interface ErrorReportSheet {
  name: string;
  header: unknown[];
  rows: { rowNumber: number; cells: unknown[]; errors: string }[];
}

/** The rows that failed, as the user sent them, with an "Import errors" column — fix and re-upload. */
export async function writeErrorReport(sheets: ErrorReportSheet[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31) || "Errors", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(["Import errors", "Row", ...sheet.header]);
    ws.getRow(1).font = { bold: true };
    ws.getColumn(1).width = 60;
    ws.getColumn(1).alignment = { wrapText: true, vertical: "top" };
    for (const row of sheet.rows) ws.addRow([row.errors, row.rowNumber, ...row.cells]);
    ws.getColumn(1).eachCell((cell, index) => index > 1 && (cell.font = { color: { argb: "FFB91C1C" } }));
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export function downloadFile(data: ArrayBuffer, fileName: string) {
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
