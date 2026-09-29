import { ColumnsPanel } from "@/components/settings/templates/ColumnsPanel";
import { OptionsPanel } from "@/components/settings/templates/OptionsPanel";
import { TemplatePreview } from "@/components/settings/templates/TemplatePreview";
import { TextBlocksPanel } from "@/components/settings/templates/TextBlocksPanel";
import { TotalsPanel } from "@/components/settings/templates/TotalsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCatalog } from "@/lib/api/catalogApi";
import { updateTemplate } from "@/lib/api/documentTemplateApi";
import { appFormatters } from "@/lib/document/formatters";
import { renderDocument } from "@/lib/document/renderDocument";
import { allFields } from "@/lib/inventory/registry";
import { showError, showSuccess } from "@/lib/utils";
import type { FieldDefinition } from "@/types/catalog";
import type { DocumentTemplate } from "@/types/documentTemplate";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface TemplateEditorProps {
  template: DocumentTemplate;
  onBack: () => void;
  onSaved: () => void;
}

/**
 * Two panes: controls on the left, a live page preview on the right. The editor replaces the Settings
 * list rather than opening in a Sheet — the content pane is max-w-6xl minus padding (~1100px), and a
 * formLg Sheet would leave no room for a preview beside the controls.
 */
export function TemplateEditor({ template, onBack, onSaved }: TemplateEditorProps) {
  const [draft, setDraft] = useState<DocumentTemplate>(template);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(template), [template]);

  useEffect(() => {
    getCatalog().then((catalog) => setFields(allFields(catalog)));
  }, []);

  // Rendered here rather than inside the preview so the columns panel can show the same diagnostics the
  // document would produce — a deleted field is flagged on the row it belongs to.
  const diagnostics = useMemo(
    () =>
      renderDocument({
        template: draft,
        lines: [{ id: "probe", description: "probe", lineTotal: 0 }],
        amounts: { subtotal: 0, total: 0 },
        currency: "USD",
        fields,
        formatters: appFormatters,
      }).diagnostics,
    [draft, fields]
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(template);
  const enabledColumns = draft.columns.filter((column) => column.enabled).length;

  const save = async () => {
    setSaving(true);
    try {
      await updateTemplate(draft.id, { name: draft.name, columns: draft.columns, totals: draft.totals, blocks: draft.blocks, options: draft.options });
      showSuccess("Saved", `“${draft.name.trim()}” updated.`);
      onSaved();
    } catch (error: any) {
      showError("Could not save", error?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> All templates
        </Button>
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9 max-w-xs font-medium" aria-label="Template name" />
        {dirty && (
          <Badge variant="outline" className="font-normal">
            Unsaved changes
          </Badge>
        )}
        <div className="flex-1" />
        <Button onClick={save} disabled={saving || !dirty || !draft.name.trim()}>
          {saving ? "Saving…" : "Save template"}
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_26rem] gap-6 items-start">
        <Tabs defaultValue="columns">
          <TabsList>
            <TabsTrigger value="columns">Columns</TabsTrigger>
            <TabsTrigger value="totals">Totals</TabsTrigger>
            <TabsTrigger value="text">Text blocks</TabsTrigger>
            <TabsTrigger value="options">Page</TabsTrigger>
          </TabsList>

          <TabsContent value="columns" className="mt-4">
            <ColumnsPanel
              template={draft}
              fields={fields}
              diagnostics={diagnostics}
              onChange={(columns) => setDraft({ ...draft, columns })}
              onLandscape={(landscape) => setDraft({ ...draft, options: { ...draft.options, landscape } })}
            />
          </TabsContent>

          <TabsContent value="totals" className="mt-4">
            <TotalsPanel totals={draft.totals} onChange={(totals) => setDraft({ ...draft, totals })} />
          </TabsContent>

          <TabsContent value="text" className="mt-4">
            <TextBlocksPanel blocks={draft.blocks} onChange={(blocks) => setDraft({ ...draft, blocks })} />
          </TabsContent>

          <TabsContent value="options" className="mt-4">
            <OptionsPanel options={draft.options} enabledColumns={enabledColumns} onChange={(options) => setDraft({ ...draft, options })} />
          </TabsContent>
        </Tabs>

        <div className="sticky top-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
          <TemplatePreview template={draft} fields={fields} />
          <p className="text-xs text-muted-foreground">
            The real document, scaled down and filled with your own stock — not a mock-up. Columns with nothing to show collapse here exactly as they will on paper.
          </p>
        </div>
      </div>
    </div>
  );
}
