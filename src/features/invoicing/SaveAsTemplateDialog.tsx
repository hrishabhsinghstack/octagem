import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getCatalog } from "@/lib/api/catalogApi";
import { createTemplate, resolveTemplateFor, setDefaultTemplate, updateTemplate } from "@/lib/api/documentTemplateApi";
import { setInvoiceTemplate } from "@/lib/api/invoiceApi";
import { buildProposedTemplate, proposeColumns, type ProposedColumn } from "@/lib/document/proposeTemplate";
import type { DocumentLineInput } from "@/lib/document/renderDocument";
import { allFields } from "@/lib/inventory/registry";
import { showError, showSuccess } from "@/lib/utils";
import type { DocumentTemplate } from "@/types/documentTemplate";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  /** The layout this invoice currently prints with — the starting point the proposal builds on. */
  templateId?: string;
  lines: DocumentLineInput[];
  onSaved: () => void;
}

/**
 * "This invoice looks right — make it a template." Rather than making the tenant hunt through a field
 * picker, the engine reads the document and proposes a column for every catalog field that actually
 * carried a value on these lines; the user unticks what they don't want.
 */
export function SaveAsTemplateDialog({ open, onOpenChange, invoiceId, templateId, lines, onSaved }: SaveAsTemplateDialogProps) {
  const [name, setName] = useState("");
  const [base, setBase] = useState<DocumentTemplate | null>(null);
  const [proposed, setProposed] = useState<ProposedColumn[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    Promise.all([resolveTemplateFor("invoice", templateId), getCatalog()]).then(([template, catalog]) => {
      if (cancelled) return;
      const suggestions = proposeColumns({ base: template, lines, fields: allFields(catalog) });
      setBase(template);
      setProposed(suggestions);
      // Everything on by default: the proposal only contains fields this document actually filled in.
      setAccepted(new Set(suggestions.map((s) => s.column.id)));
      setName(`${template.name} (copy)`);
      setMakeDefault(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, templateId, lines]);

  const toggle = (id: string) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async () => {
    if (!base) return;
    setSaving(true);
    try {
      // Create an empty shell first so the API assigns the id and enforces the name rules, then write the
      // proposed columns onto it — that keeps all validation in one place rather than duplicating it here.
      const created = await createTemplate({ kind: "invoice", name, fromId: base.id });
      const withColumns = buildProposedTemplate({
        base: { ...base, columns: created.columns },
        accepted: proposed.filter((p) => accepted.has(p.column.id)).map((p) => p.column),
        name,
        id: created.id,
      });
      const saved = await updateTemplate(created.id, { columns: withColumns.columns });

      if (makeDefault) await setDefaultTemplate("invoice", saved.id);
      // Point this invoice at what was just built, so the result is visible immediately.
      await setInvoiceTemplate(invoiceId, saved.id);

      showSuccess("Template saved", makeDefault ? `“${saved.name}” saved and set as the default.` : `“${saved.name}” saved and applied to ${invoiceId}.`);
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      showError("Could not save the template", error?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Save as template</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-1">
            <Label htmlFor="template-name" className="text-xs text-muted-foreground">
              Template name<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diamond wholesale" />
            <p className="text-xs text-muted-foreground">Starts from “{base?.name ?? "…"}”, the layout this invoice uses now.</p>
          </div>

          {proposed.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium">Columns found on this invoice</p>
              </div>
              <p className="text-xs text-muted-foreground">
                These stock details are filled in on this invoice but aren’t shown yet. Tick the ones worth printing.
              </p>
              <div className="rounded-md border divide-y">
                {proposed.map((suggestion) => (
                  <label key={suggestion.column.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" className="h-4 w-4" checked={accepted.has(suggestion.column.id)} onChange={() => toggle(suggestion.column.id)} />
                    <span className="text-sm flex-1">{suggestion.label}</span>
                    <span className="text-xs text-muted-foreground">
                      on {suggestion.presentOn} of {lines.length} {lines.length === 1 ? "line" : "lines"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4">
              Nothing extra to suggest — this invoice’s lines carry no stock details beyond what the current layout already prints. The template will be saved as
              a copy you can edit in Settings.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="h-4 w-4" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
            Make this the default layout for new invoices
          </label>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save template"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
