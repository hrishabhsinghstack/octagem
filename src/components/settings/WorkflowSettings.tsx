import { Card, CardContent } from "@/components/ui/card";
import { Workflow } from "lucide-react";

/**
 * Empty by design, for now. The two toggles that lived here gated the Quotes and Sales Order
 * modules; those documents were removed when the sales chain became Memo → Invoice. The panel is
 * kept rather than deleted because it — together with WorkflowSettings in types/settings.ts and
 * RequireWorkflowSetting — is the wired-up seam the next optional process step drops into, and
 * rebuilding that seam costs more than carrying an empty screen.
 */
export function WorkflowSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Workflow Settings</h2>
        <p className="text-muted-foreground mt-1">Turn optional process steps — and entire optional modules — on or off to match how your business actually operates.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Workflow className="h-5 w-5 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-medium">No optional steps to configure</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Your sales process runs Memo → Invoice, with direct invoicing as the other way in. Neither step is optional, so there is nothing to switch off here yet.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
