import { resolveTemplateFor } from "@/lib/api/documentTemplateApi";
import { getCatalog } from "@/lib/api/catalogApi";
import { appFormatters } from "@/lib/document/formatters";
import { renderDocument, type DocumentAmounts, type DocumentLineInput, type RenderedDocument } from "@/lib/document/renderDocument";
import { allFields } from "@/lib/inventory/registry";
import type { FieldDefinition } from "@/types/catalog";
import type { DocumentKind } from "@/types/documentTemplate";
import { useEffect, useMemo, useState } from "react";
import { builtInTemplate } from "@/lib/document/builtInTemplates";

interface UseDocumentRenderArgs {
  kind: DocumentKind;
  /** The template stamped on the document; undefined falls back to the tenant default, then the starter. */
  templateId?: string;
  lines: DocumentLineInput[];
  amounts: DocumentAmounts;
  currency: string;
  notes?: string;
}

/**
 * Resolves a template and the catalog, then renders the document. One result feeds both the on-screen
 * table and the printed page, so the two cannot disagree.
 *
 * The initial value is the built-in starter rendered synchronously, never null: PrintableDocument
 * already renders before getBusinessProfile() resolves, and adding two more async reads without a real
 * initial value would make "Ctrl+P in the first frame prints a blank page" reliably reproducible.
 * Reading the store synchronously instead would be the wrong fix — lib/api/* exists precisely so it can
 * be swapped for HTTP later.
 */
export function useDocumentRender({ kind, templateId, lines, amounts, currency, notes }: UseDocumentRenderArgs): RenderedDocument {
  const [template, setTemplate] = useState(() => builtInTemplate(kind));
  const [fields, setFields] = useState<FieldDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([resolveTemplateFor(kind, templateId), getCatalog()]).then(([resolved, catalog]) => {
      if (cancelled) return;
      setTemplate(resolved);
      // allFields, not fieldsForCategory: a field deactivated in the catalog still has values on items,
      // and a template printing it must keep working (the renderer flags it rather than dropping it).
      setFields(allFields(catalog));
    });
    return () => {
      cancelled = true;
    };
  }, [kind, templateId]);

  return useMemo(
    () => renderDocument({ template, lines, amounts, currency, fields, notes, formatters: appFormatters }),
    [template, lines, amounts, currency, fields, notes]
  );
}
