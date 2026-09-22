/** Browser print-to-PDF — every detail page renders a hidden `.print-area` (PrintableDocument) that only becomes visible under `@media print`, so this also serves as "Download" (the user picks "Save as PDF" as the print destination). No PDF library needed. */
export function printDocument() {
  window.print();
}
