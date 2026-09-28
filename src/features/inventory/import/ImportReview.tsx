import { SearchSelect } from "@/components/catalog/SearchSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeIssue, type ImportPlan, type PlannedRow, type UnknownValue } from "@/lib/inventory/importPlan";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Download, Plus } from "lucide-react";
import { useState } from "react";

interface ImportReviewProps {
  plan: ImportPlan;
  /** field key → label, for readable messages; also knows each category's label. */
  labelFor: (categoryKey: string | undefined, fieldKey: string) => string;
  categoryLabel: (categoryKey: string) => string;
  /** Apply "this value means that" to every row holding it. */
  onFix: (value: UnknownValue, replacement: string) => void;
  /** Add the value to its master list (admins only) — undefined hides the action. */
  onAddToList?: (value: UnknownValue) => void;
  onDownloadErrors: () => void;
}

const ROW_LIMIT = 200;

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums mt-0.5", tone === "good" && "text-emerald-600", tone === "bad" && value > 0 && "text-destructive", tone === "warn" && value > 0 && "text-amber-600")}>{value}</p>
    </div>
  );
}

function UnknownValueCard({ value, categoryLabel, onFix, onAddToList }: { value: UnknownValue; categoryLabel: string; onFix: ImportReviewProps["onFix"]; onAddToList?: ImportReviewProps["onAddToList"] }) {
  const [choice, setChoice] = useState(value.suggestion ?? "");
  const rows = value.rows.length > 6 ? `${value.rows.slice(0, 6).join(", ")} +${value.rows.length - 6}` : value.rows.join(", ");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm">
          <span className="text-muted-foreground">{categoryLabel} · {value.fieldLabel}:</span> <span className="font-medium">“{value.value}”</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {value.rows.length} row{value.rows.length === 1 ? "" : "s"} ({rows})
        </p>
      </div>
      <span className="text-xs text-muted-foreground">means</span>
      <div className="w-44">
        <SearchSelect value={choice} onChange={setChoice} options={value.options} placeholder="Pick a value" className="h-8 text-xs" />
      </div>
      <Button size="sm" className="h-8" disabled={!choice} onClick={() => onFix(value, choice)}>
        <Check className="h-3.5 w-3.5 mr-1" /> Apply to {value.rows.length === 1 ? "row" : "all"}
      </Button>
      {onAddToList && value.masterListKey && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => onAddToList(value)} title="Add it to the master list — every row with it becomes valid">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add to list
        </Button>
      )}
    </div>
  );
}

type Filter = "all" | "error" | "warning" | "ok";

export function ImportReview({ plan, labelFor, categoryLabel, onFix, onAddToList, onDownloadErrors }: ImportReviewProps) {
  const [filter, setFilter] = useState<Filter>(plan.summary.error > 0 ? "error" : "all");

  const visible = plan.rows.filter(
    (row) => filter === "all" || (filter === "error" && row.action === "error") || (filter === "warning" && row.warnings.length > 0) || (filter === "ok" && row.action !== "error")
  );

  const describe = (row: PlannedRow, issues: PlannedRow["errors"]) => issues.map((issue) => describeIssue(labelFor(row.categoryKey, issue.fieldKey), issue.message));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="New items" value={plan.summary.create} tone="good" />
        <Stat label="Updates" value={plan.summary.update} tone="good" />
        <Stat label="Rows with errors" value={plan.summary.error} tone="bad" />
        <Stat label="Rows with warnings" value={plan.summary.warnings} tone="warn" />
      </div>

      {plan.missingRequired.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {plan.missingRequired.map((entry) => (
            <p key={entry.categoryKey}>
              <span className="font-medium">{categoryLabel(entry.categoryKey)}:</span> no column for {entry.labels.join(", ")} — go back and map one, or new rows will fail.
            </p>
          ))}
        </div>
      )}

      {plan.unknownValues.length > 0 && (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold">Values to fix ({plan.unknownValues.length})</p>
            <p className="text-xs text-muted-foreground">Each value is listed once. Choosing what it means fixes every row that has it.</p>
          </div>
          {plan.unknownValues.map((value) => (
            <UnknownValueCard key={`${value.categoryKey}|${value.fieldKey}|${value.value}`} value={value} categoryLabel={categoryLabel(value.categoryKey)} onFix={onFix} onAddToList={onAddToList} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1">
            {(
              [
                ["all", `All ${plan.rows.length}`],
                ["error", `Errors ${plan.summary.error}`],
                ["warning", `Warnings ${plan.summary.warnings}`],
                ["ok", `Ready ${plan.summary.create + plan.summary.update}`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn("px-2.5 py-1 rounded-full text-xs border", filter === key ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          {plan.summary.error > 0 && (
            <Button variant="outline" size="sm" onClick={onDownloadErrors}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download error rows
            </Button>
          )}
        </div>

        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-[6rem_8rem_1fr_6rem] gap-3 px-3 py-2 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground">
            <span>Row</span>
            <span>Stock #</span>
            <span>Name · issues</span>
            <span className="text-right">Result</span>
          </div>
          <div className="max-h-[22rem] overflow-y-auto divide-y">
            {visible.slice(0, ROW_LIMIT).map((row) => (
              <div key={`${row.sheetName ?? ""}-${row.rowNumber}`} className="grid grid-cols-[6rem_8rem_1fr_6rem] gap-3 px-3 py-2 text-sm items-start">
                <span className="text-muted-foreground tabular-nums truncate" title={row.sheetName}>
                  {row.sheetName ? `${row.sheetName.slice(0, 8)} ` : ""}
                  {row.rowNumber}
                </span>
                <span className="tabular-nums truncate">
                  {row.code || "—"}
                  {row.autoNumbered && <span className="block text-[10px] text-muted-foreground">auto-numbered</span>}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate">{String(row.values.title ?? row.raw.title ?? "") || <span className="text-muted-foreground">No name</span>}</p>
                  {describe(row, row.errors).map((message) => (
                    <p key={message} className="text-xs text-destructive">
                      {message}
                    </p>
                  ))}
                  {describe(row, row.warnings).map((message) => (
                    <p key={message} className="text-xs text-amber-600 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {message}
                    </p>
                  ))}
                </div>
                <span className="text-right">
                  {row.action === "error" ? <Badge variant="destructive">Skipped</Badge> : row.action === "update" ? <Badge variant="secondary">Update</Badge> : <Badge variant="success">New</Badge>}
                </span>
              </div>
            ))}
            {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No rows in this view.</p>}
          </div>
          {visible.length > ROW_LIMIT && <p className="px-3 py-2 border-t text-xs text-muted-foreground">Showing the first {ROW_LIMIT} of {visible.length} rows. Download the error rows to see them all.</p>}
        </div>
      </div>
    </div>
  );
}
