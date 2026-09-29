import type { TemplateOptions } from "@/types/documentTemplate";
import { useEffect } from "react";

const STYLE_ID = "octagem-print-page";

/**
 * Injects the `@page` rule for the active template — paper size, orientation and margins.
 *
 * This cannot be a Tailwind class: `@page` is a CSS at-rule with no utility equivalent, and the JIT
 * scans source text at build time so a runtime value would emit nothing anyway. Before this, the
 * codebase had no `@page` rule at all, leaving margins and orientation entirely to whatever the browser's
 * print dialog defaulted to.
 *
 * One shared <style> element, rewritten rather than appended, so opening several documents in a session
 * cannot stack conflicting rules. Note the user can still override orientation in the print dialog, which
 * is why the renderer clamps column widths regardless of what this asks for.
 */
export function usePrintPageStyle(options: Pick<TemplateOptions, "paper" | "landscape">) {
  useEffect(() => {
    const style = document.getElementById(STYLE_ID) ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: STYLE_ID }));
    style.textContent = `@page { size: ${options.paper} ${options.landscape ? "landscape" : "portrait"}; margin: 12mm; }`;

    return () => {
      // Left in place deliberately on unmount of a single document: removing it mid-print would drop the
      // rule while the dialog is open. It is overwritten by whichever document mounts next.
    };
  }, [options.paper, options.landscape]);
}
