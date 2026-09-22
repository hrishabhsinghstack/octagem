import { showError } from "@/lib/utils";

export interface ShareableDocument {
  title: string;
  text: string;
}

/** Native OS share sheet where supported (mobile Safari/Chrome); falls back to a prefilled mailto: draft on desktop browsers without the Web Share API. */
export async function shareDocument(doc: ShareableDocument) {
  if (navigator.share) {
    try {
      await navigator.share(doc);
    } catch (error: any) {
      if (error?.name !== "AbortError") showError("Share failed", error?.message || "Could not share this document.");
    }
    return;
  }
  const subject = encodeURIComponent(doc.title);
  const body = encodeURIComponent(doc.text);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
