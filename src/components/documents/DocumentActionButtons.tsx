import { Button } from "@/components/ui/button";
import { printDocument } from "@/lib/print";
import { shareDocument, type ShareableDocument } from "@/lib/share";
import { Download, Printer, Share2 } from "lucide-react";

interface DocumentActionButtonsProps {
  shareData: ShareableDocument;
}

/** Print and Download both open the browser print dialog — there's no PDF library here, so Download means "choose Save as PDF as the destination." Share uses the OS share sheet where available, otherwise a prefilled email draft. */
export function DocumentActionButtons({ shareData }: DocumentActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={printDocument} title="Print">
        <Printer className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={printDocument} title="Download (choose Save as PDF)">
        <Download className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => shareDocument(shareData)} title="Share">
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
