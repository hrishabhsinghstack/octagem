import { TemplateEditor } from "@/components/settings/templates/TemplateEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  isDefaultTemplate,
  isTemplateHidden,
  listTemplates,
  setDefaultTemplate,
  setTemplateHidden,
} from "@/lib/api/documentTemplateApi";
import { cn, showError, showSuccess } from "@/lib/utils";
import type { DocumentKind, DocumentTemplate } from "@/types/documentTemplate";
import { DOCUMENT_KINDS } from "@/types/documentTemplate";
import { Copy, Eye, EyeOff, Pencil, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Mode = { view: "list" } | { view: "edit"; id: string };

export function DocumentTemplateSettings() {
  const [kind, setKind] = useState<DocumentKind>("invoice");
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [mode, setMode] = useState<Mode>({ view: "list" });
  const [duplicating, setDuplicating] = useState<DocumentTemplate | null>(null);
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);

  const refresh = useCallback(() => {
    // includeHidden so an admin can un-hide something; the picker elsewhere uses the default (false).
    listTemplates(kind, true).then(setTemplates);
  }, [kind]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (mode.view !== "edit") {
      setEditing(null);
      return;
    }
    getTemplate(mode.id).then((found) => setEditing(found ?? null));
  }, [mode, templates]);

  if (mode.view === "edit" && editing) {
    return (
      <TemplateEditor
        template={editing}
        onBack={() => setMode({ view: "list" })}
        onSaved={() => {
          refresh();
          setMode({ view: "list" });
        }}
      />
    );
  }

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      showSuccess("Done", success);
      refresh();
    } catch (error: any) {
      showError("Could not do that", error?.message || "Something went wrong.");
    }
  };

  const handleDelete = (template: DocumentTemplate) => {
    if (!window.confirm(`Delete “${template.name}”? Invoices already using it will fall back to the company default.`)) return;
    void run(() => deleteTemplate(template.id), `“${template.name}” deleted.`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Document Templates</h2>
        <p className="text-muted-foreground mt-1">
          Control what prints on an invoice — which columns appear, what they are called, and the terms beneath them. The same layout drives the on-screen
          document, so the two can never disagree.
        </p>
      </div>

      <Tabs value={kind} onValueChange={(value) => setKind(value as DocumentKind)}>
        <TabsList>
          {DOCUMENT_KINDS.map((documentKind) => (
            <TabsTrigger key={documentKind.key} value={documentKind.key} disabled={!documentKind.enabled} title={documentKind.enabled ? undefined : "Coming soon"}>
              {documentKind.label}
              {!documentKind.enabled && <span className="ml-1.5 text-[10px] text-muted-foreground">soon</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="divide-y">
        {templates.map((template) => (
          <TemplateRow
            key={template.id}
            template={template}
            isDefault={isDefaultTemplate(kind, template.id)}
            hidden={isTemplateHidden(template.id)}
            onEdit={() => setMode({ view: "edit", id: template.id })}
            onDuplicate={() => setDuplicating(template)}
            onSetDefault={() => run(() => setDefaultTemplate(kind, template.id), `“${template.name}” is now the default.`)}
            onDelete={() => handleDelete(template)}
            onToggleHidden={(next) => run(() => setTemplateHidden(template.id, next), next ? `“${template.name}” hidden.` : `“${template.name}” available again.`)}
          />
        ))}
        {templates.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">No templates for this document yet.</p>}
      </Card>

      <DuplicateDialog
        source={duplicating}
        kind={kind}
        onClose={() => setDuplicating(null)}
        onCreated={(created) => {
          setDuplicating(null);
          refresh();
          setMode({ view: "edit", id: created.id });
        }}
      />
    </div>
  );
}

interface TemplateRowProps {
  template: DocumentTemplate;
  isDefault: boolean;
  hidden: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onToggleHidden: (hidden: boolean) => void;
}

function TemplateRow({ template, isDefault, hidden, onEdit, onDuplicate, onSetDefault, onDelete, onToggleHidden }: TemplateRowProps) {
  const enabled = template.columns.filter((column) => column.enabled).length;

  return (
    <div className={cn("flex items-center gap-4 px-4 py-3", hidden && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{template.name}</p>
          {/* Same Built-in / Added vocabulary as the catalog's FieldsPanel, so the rule reads the same way. */}
          <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
            {template.builtIn ? "Built-in" : "Added"}
          </Badge>
          {isDefault && (
            <Badge variant="secondary" className="font-normal text-[10px] px-1.5 py-0">
              Default
            </Badge>
          )}
          {hidden && (
            <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0 text-muted-foreground">
              Hidden
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {enabled} column{enabled === 1 ? "" : "s"} · {template.options.paper} {template.options.landscape ? "landscape" : "portrait"}
          {template.blocks.length > 0 && ` · ${template.blocks.length} text block${template.blocks.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isDefault && !hidden && (
          <Button variant="ghost" size="sm" onClick={onSetDefault} title="Use this layout for new invoices">
            <Star className="h-3.5 w-3.5 mr-1" /> Set default
          </Button>
        )}

        {template.builtIn ? (
          <>
            {/* A built-in row offers "Duplicate & edit" where a tenant row offers "Edit" — the UI teaches
                the rule, so the API rarely has to reject anything. */}
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate &amp; edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleHidden(!hidden)}
              title={hidden ? "Show in the layout picker" : "Hide from the layout picker"}
              aria-label={hidden ? "Show" : "Hide"}
            >
              {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} title="Duplicate" aria-label="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} title="Delete" aria-label="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DuplicateDialog({
  source,
  kind,
  onClose,
  onCreated,
}: {
  source: DocumentTemplate | null;
  kind: DocumentKind;
  onClose: () => void;
  onCreated: (created: DocumentTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (source) setName(`${source.name} (copy)`);
  }, [source]);

  const submit = async () => {
    if (!source) return;
    setSaving(true);
    try {
      const created = await createTemplate({ kind, name, fromId: source.id });
      showSuccess("Template created", `“${created.name}” is ready to edit.`);
      onCreated(created);
    } catch (error: any) {
      showError("Could not duplicate", error?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>Duplicate “{source?.name}”</SheetTitle>
        </SheetHeader>
        <div className="space-y-1">
          <Label htmlFor="duplicate-name" className="text-xs text-muted-foreground">
            New template name<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input id="duplicate-name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">Copies every column, total and text block. The original is untouched.</p>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Duplicate & edit"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
