import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/authContext";
import { ImportHistory } from "@/features/inventory/import/ImportHistory";
import { ImportReview } from "@/features/inventory/import/ImportReview";
import { commitImport, getImportContext, getWorkbookSpec } from "@/lib/api/importApi";
import { normaliseToken } from "@/lib/inventory/fieldValues";
import {
  CATEGORY_COLUMN,
  autoMapColumns,
  buildWorkbookPlan,
  describeIssue,
  detectHeaderRow,
  guessCategory,
  resolveCategory,
  type ColumnMapping,
  type ImportContext,
  type SheetInput,
  type UnknownValue,
} from "@/lib/inventory/importPlan";
import { addListEntry } from "@/lib/store/masterDataStore";
import { cn, showError, showSuccess } from "@/lib/utils";
import type { FieldDefinition } from "@/types/catalog";
import type { ImportBatch } from "@/types/importBatch";
import type { MasterListKey } from "@/types/masterData";
import { Check, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after an import or an undo, so the page can reload its list. */
  onImported: () => void;
}

interface SheetConfig {
  name: string;
  rows: unknown[][];
  include: boolean;
  /** Category for every row; undefined when a Category column decides per row (or the user hasn't chosen). */
  categoryKey?: string;
  headerIndex: number;
  mapping: ColumnMapping;
}

const STEPS = ["Upload", "Match columns", "Review & fix", "Done"] as const;
const IGNORE = "__ignore__";
/** The spreadsheet library is ~1 MB; it loads only when a file is read or written. */
const loadSpreadsheet = () => import("@/lib/inventory/spreadsheet");

/** Fields a sheet can map to: its category's, or every category's when rows say their own category. */
function mappableFields(context: ImportContext, categoryKey: string | undefined): FieldDefinition[] {
  if (categoryKey) return context.fieldsFor(categoryKey);
  const byKey = new Map<string, FieldDefinition>();
  for (const category of context.categories) for (const field of context.fieldsFor(category.key)) if (!byKey.has(field.key)) byKey.set(field.key, field);
  return [...byKey.values()];
}

export function ImportWizard({ open, onOpenChange, onImported }: ImportWizardProps) {
  const { can } = useAuth();
  const canAddMasterData = can("catalog", "edit");
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [context, setContext] = useState<ImportContext | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetConfig[]>([]);
  const [mode, setMode] = useState<"create" | "upsert">("create");
  const [allOrNothing, setAllOrNothing] = useState(false);
  const [valueFixes, setValueFixes] = useState<Record<string, Record<string, string>>>({});
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ImportBatch | null>(null);
  /** Bumped after master data changes, so the plan re-validates against the new list. */
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setFileName("");
    setSheets([]);
    setValueFixes({});
    setResult(null);
    getImportContext().then(setContext);
  }, [open]);

  const categoryLabel = (key: string) => context?.categories.find((c) => c.key === key)?.label ?? key;
  const labelFor = (categoryKey: string | undefined, fieldKey: string) => {
    if (fieldKey === CATEGORY_COLUMN) return "Category";
    const field = context && categoryKey ? context.fieldsFor(categoryKey).find((f) => f.key === fieldKey) : undefined;
    return field?.label ?? fieldKey;
  };

  /* ------------------------------------------------------------ files */

  const downloadTemplate = async () => {
    try {
      const [{ writeWorkbook, downloadFile }, spec] = await Promise.all([loadSpreadsheet(), getWorkbookSpec()]);
      downloadFile(await writeWorkbook(spec), `inventory-import-template.xlsx`);
    } catch (error: any) {
      showError("Could not create the template", error?.message);
    }
  };

  const readFile = async (file: File) => {
    if (!context) return;
    if (!/\.(xlsx|csv|tsv|txt)$/i.test(file.name)) {
      showError("Unsupported file", "Upload an Excel workbook (.xlsx) or a CSV file. Older .xls files: open in Excel and save as .xlsx.");
      return;
    }
    setReading(true);
    try {
      const { readSpreadsheet } = await loadSpreadsheet();
      const data = await readSpreadsheet(await file.arrayBuffer(), file.name);
      const configs = data.map((sheet): SheetConfig => {
        const byName = resolveCategory(sheet.name, context.categories)?.key;
        const allFields = mappableFields(context, undefined);
        const headerIndex = detectHeaderRow(sheet.rows, allFields);
        const headers = sheet.rows[headerIndex] ?? [];
        const hasCategoryColumn = autoMapColumns(headers, allFields).includes(CATEGORY_COLUMN);
        const categoryKey = hasCategoryColumn ? undefined : byName ?? guessCategory(headers, context.categories, context.fieldsFor);
        const fields = mappableFields(context, categoryKey);
        return { name: sheet.name, rows: sheet.rows, include: sheet.rows.length > headerIndex + 1, categoryKey, headerIndex, mapping: autoMapColumns(headers, fields) };
      });
      if (!configs.some((c) => c.include)) {
        showError("Nothing to import", "The file has no rows under its header.");
        return;
      }
      setFileName(file.name);
      setSheets(configs);
      setValueFixes({});
      setStep(1);
    } catch (error: any) {
      showError("Could not read the file", error?.message || "The file may be damaged or password-protected.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  /* ------------------------------------------------------------ mapping */

  const updateSheet = (index: number, patch: Partial<SheetConfig>) => setSheets((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const chooseCategory = (index: number, categoryKey: string | undefined) => {
    if (!context) return;
    const sheet = sheets[index];
    // Re-map against the chosen category's fields; keep the user's manual choices where they still apply.
    const fields = mappableFields(context, categoryKey);
    const keys = new Set([...fields.map((f) => f.key), CATEGORY_COLUMN]);
    const auto = autoMapColumns(sheet.rows[sheet.headerIndex] ?? [], fields);
    updateSheet(index, { categoryKey, mapping: sheet.mapping.map((key, column) => (key && keys.has(key) ? key : auto[column])) });
  };

  const setColumn = (sheetIndex: number, column: number, fieldKey: string) => {
    const sheet = sheets[sheetIndex];
    const next = sheet.mapping.map((key, i) => (i === column ? (fieldKey === IGNORE ? null : fieldKey) : key === fieldKey ? null : key));
    updateSheet(sheetIndex, { mapping: next });
  };

  const included = sheets.filter((s) => s.include);
  const sheetInputs = (): SheetInput[] =>
    included.map((s) => ({ sheetName: sheets.length > 1 ? s.name : undefined, dataRows: s.rows.slice(s.headerIndex + 1), mapping: s.mapping, categoryKey: s.categoryKey, headerRowIndex: s.headerIndex }));

  const unresolvedSheets = included.filter((s) => !s.categoryKey && !s.mapping.includes(CATEGORY_COLUMN));

  /* ------------------------------------------------------------ plan */

  const plan = useMemo(() => (context && step >= 2 ? buildWorkbookPlan(sheetInputs(), { mode, valueFixes }, context) : null), [context, step, sheets, mode, valueFixes, listVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFix = (value: UnknownValue, replacement: string) => {
    setValueFixes((current) => ({ ...current, [value.fieldKey]: { ...current[value.fieldKey], [normaliseToken(value.value)]: replacement } }));
    showSuccess("Fixed", `“${value.value}” → “${replacement}” on ${value.rows.length} row${value.rows.length === 1 ? "" : "s"}.`);
  };

  const addToList = (value: UnknownValue) => {
    if (!value.masterListKey) return;
    addListEntry(value.masterListKey as MasterListKey, value.value);
    setListVersion((v) => v + 1);
    showSuccess("Added to master data", `“${value.value}” is now in ${value.fieldLabel}.`);
  };

  const downloadErrors = async () => {
    if (!plan) return;
    const { writeErrorReport, downloadFile } = await loadSpreadsheet();
    const reports = included
      .map((sheet) => ({
        name: sheet.name,
        header: sheet.rows[sheet.headerIndex] ?? [],
        rows: plan.rows
          .filter((r) => r.action === "error" && (sheets.length === 1 || r.sheetName === sheet.name))
          .map((r) => ({ rowNumber: r.rowNumber, cells: sheet.rows[r.rowNumber - 1] ?? [], errors: r.errors.map((e) => describeIssue(labelFor(r.categoryKey, e.fieldKey), e.message)).join("; ") })),
      }))
      .filter((report) => report.rows.length > 0);
    downloadFile(await writeErrorReport(reports), `${fileName.replace(/\.[^.]+$/, "")}-errors.xlsx`);
  };

  const commit = async () => {
    if (!plan) return;
    setCommitting(true);
    try {
      // Re-plan against stock as it is now — someone may have received an item with one of these numbers since the preview.
      const fresh = await getImportContext();
      const latest = buildWorkbookPlan(sheetInputs(), { mode, valueFixes }, fresh);
      if (latest.summary.error !== plan.summary.error || latest.summary.create !== plan.summary.create || latest.summary.update !== plan.summary.update) {
        setContext(fresh);
        showError("Stock changed", "Inventory changed since this preview — the results below are refreshed. Review and import again.");
        return;
      }
      const batch = await commitImport(latest, { fileName, allOrNothing });
      setResult(batch);
      setStep(3);
      onImported();
    } catch (error: any) {
      showError("Import failed", error?.message || "Nothing was imported.");
    } finally {
      setCommitting(false);
    }
  };

  /* ------------------------------------------------------------ render */

  const ready = plan ? plan.summary.create + plan.summary.update : 0;
  const blockedByAllOrNothing = Boolean(plan && allOrNothing && plan.summary.error > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg" className="p-0 gap-0 h-full flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Import inventory</h2>
          <div className="flex items-center gap-2 mt-3">
            {STEPS.map((label, index) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    index < step && "bg-primary text-primary-foreground",
                    index === step && "border-2 border-primary text-primary",
                    index > step && "border text-muted-foreground"
                  )}
                >
                  {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span className={cn("text-xs whitespace-nowrap", index === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
                {index < STEPS.length - 1 && <div className={cn("h-px flex-1", index < step ? "bg-primary" : "bg-border")} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-6 max-w-3xl">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <p className="text-sm font-medium">1. Start from the template</p>
                  <p className="text-xs text-muted-foreground">A sheet per category, with dropdowns filled from your master data and notes on every column. Or use your own sheet — columns are matched automatically.</p>
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download template
                  </Button>
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm font-medium">2. Choose what the file does</p>
                  {(
                    [
                      ["create", "Add new items", "Stock numbers already in inventory are reported, not changed."],
                      ["upsert", "Add new and update existing", "Rows whose stock number exists update that item; blank cells leave values unchanged."],
                    ] as const
                  ).map(([value, title, hint]) => (
                    <label key={value} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="radio" name="import-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-primary" />
                      <span>
                        {title}
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) readFile(file);
                }}
                className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 cursor-pointer transition-colors", dragging ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
              >
                {reading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                <span className="text-sm font-medium">{reading ? "Reading…" : "Drop your file here, or click to choose"}</span>
                <span className="text-xs text-muted-foreground">Excel (.xlsx) or CSV — your existing stock sheet works</span>
                <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} disabled={reading || !context} />
              </label>

              <label className="flex items-start gap-3 text-sm">
                <Switch checked={allOrNothing} onCheckedChange={setAllOrNothing} />
                <span>
                  All or nothing
                  <span className="block text-xs text-muted-foreground">Off (recommended): valid rows are imported and rows with errors are listed for fixing. On: the whole file is refused if any row has an error.</span>
                </span>
              </label>

              <ImportHistory onUndone={onImported} />
            </div>
          )}

          {step === 1 && context && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                <FileSpreadsheet className="inline h-4 w-4 mr-1 -mt-0.5" /> {fileName} — check how each column will be read. Columns set to “Don’t import” are ignored.
              </p>
              {sheets.map((sheet, sheetIndex) => {
                const fields = mappableFields(context, sheet.categoryKey);
                const headers = sheet.rows[sheet.headerIndex] ?? [];
                const sample = sheet.rows.slice(sheet.headerIndex + 1).find((row) => row.some((cell) => cell !== null && cell !== ""));
                const dataRows = sheet.rows.length - sheet.headerIndex - 1;
                const mapped = new Set(sheet.mapping.filter(Boolean));
                const missing = sheet.categoryKey ? fields.filter((f) => f.required && f.key !== "code" && f.key !== "identityModel" && !mapped.has(f.key)).map((f) => f.label) : [];
                return (
                  <div key={sheet.name} className={cn("rounded-lg border", !sheet.include && "opacity-60")}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b bg-muted/30">
                      {sheets.length > 1 && <Switch checked={sheet.include} onCheckedChange={(include) => updateSheet(sheetIndex, { include })} aria-label={`Import ${sheet.name}`} />}
                      <p className="text-sm font-medium flex-1">
                        {sheet.name} <span className="text-muted-foreground font-normal">· {dataRows} row{dataRows === 1 ? "" : "s"} · header on row {sheet.headerIndex + 1}</span>
                      </p>
                      <Label className="text-xs text-muted-foreground">Category</Label>
                      <Select value={sheet.categoryKey ?? (sheet.mapping.includes(CATEGORY_COLUMN) ? CATEGORY_COLUMN : "")} onValueChange={(v) => chooseCategory(sheetIndex, v === CATEGORY_COLUMN ? undefined : v)} disabled={!sheet.include}>
                        <SelectTrigger className={cn("w-52 h-8", sheet.include && !sheet.categoryKey && !sheet.mapping.includes(CATEGORY_COLUMN) && "border-destructive")}>
                          <SelectValue placeholder="Choose a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {sheet.mapping.includes(CATEGORY_COLUMN) && <SelectItem value={CATEGORY_COLUMN}>From the Category column</SelectItem>}
                          {context.categories.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {sheet.include && (
                      <div className="p-4 space-y-3">
                        {missing.length > 0 && (
                          <p className="text-xs text-destructive">
                            Not in this sheet: {missing.join(", ")} — required for new items{mode === "upsert" ? " (updates can leave them out)" : ""}.
                          </p>
                        )}
                        <div className="grid grid-cols-[1fr_1fr_14rem] gap-x-3 gap-y-1.5 items-center text-sm">
                          <span className="text-[11px] font-medium text-muted-foreground">Column in file</span>
                          <span className="text-[11px] font-medium text-muted-foreground">Example</span>
                          <span className="text-[11px] font-medium text-muted-foreground">Import as</span>
                          {headers.map((header, column) => (
                            <div key={column} className="contents">
                              <span className="truncate">{String(header ?? "") || <span className="text-muted-foreground">Column {column + 1}</span>}</span>
                              <span className="truncate text-muted-foreground text-xs">{sample?.[column] instanceof Date ? (sample[column] as Date).toISOString().slice(0, 10) : String(sample?.[column] ?? "")}</span>
                              <Select value={sheet.mapping[column] ?? IGNORE} onValueChange={(v) => setColumn(sheetIndex, column, v)}>
                                <SelectTrigger className={cn("h-8 text-xs", !sheet.mapping[column] && "text-muted-foreground")}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={IGNORE}>Don’t import</SelectItem>
                                  <SelectItem value={CATEGORY_COLUMN}>Category</SelectItem>
                                  {fields.map((f) => (
                                    <SelectItem key={f.key} value={f.key}>
                                      {f.label}
                                      {f.required ? " *" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step === 2 && plan && (
            <ImportReview plan={plan} labelFor={labelFor} categoryLabel={categoryLabel} onFix={applyFix} onAddToList={canAddMasterData ? addToList : undefined} onDownloadErrors={downloadErrors} />
          )}

          {step === 3 && result && (
            <div className="max-w-xl mx-auto text-center space-y-4 py-10">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <div>
                <p className="text-lg font-semibold">Import {result.id} complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.createdIds.length} added · {result.updated.length} updated{result.skippedRows > 0 && ` · ${result.skippedRows} row${result.skippedRows === 1 ? "" : "s"} skipped`}
                </p>
              </div>
              {result.skippedRows > 0 && (
                <Button variant="outline" size="sm" onClick={downloadErrors}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download skipped rows to fix
                </Button>
              )}
              <p className="text-xs text-muted-foreground">Made a mistake? Undo it from Import → Recent imports, as long as the items haven't been used since.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <Button variant="ghost" onClick={() => (step === 0 || step === 3 ? onOpenChange(false) : setStep((s) => s - 1))}>
            {step === 0 || step === 3 ? "Close" : "Back"}
          </Button>
          {step === 1 && (
            <Button
              onClick={() => {
                if (unresolvedSheets.length > 0) {
                  showError("Choose a category", `Pick a category for ${unresolvedSheets.map((s) => s.name).join(", ")}, or map a Category column.`);
                  return;
                }
                setStep(2);
              }}
              disabled={included.length === 0}
            >
              Check rows
            </Button>
          )}
          {step === 2 && plan && (
            <div className="flex items-center gap-3">
              {blockedByAllOrNothing && <span className="text-xs text-destructive">All or nothing is on — fix every error first.</span>}
              <Button onClick={commit} disabled={committing || ready === 0 || blockedByAllOrNothing}>
                {committing ? "Importing…" : `Import ${ready} item${ready === 1 ? "" : "s"}${plan.summary.error > 0 && !allOrNothing ? `, skip ${plan.summary.error}` : ""}`}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
