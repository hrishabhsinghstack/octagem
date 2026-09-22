import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getWorkflowSettings, updateWorkflowSettings } from "@/lib/api/settingsApi";
import { showSuccess } from "@/lib/utils";
import type { WorkflowSettings as WorkflowSettingsType } from "@/types/settings";
import { useEffect, useState } from "react";

export function WorkflowSettings() {
  const [settings, setSettings] = useState<WorkflowSettingsType>({ quoteModuleEnabled: true, requireQuoteBeforeSalesOrder: false });

  useEffect(() => {
    getWorkflowSettings().then(setSettings);
  }, []);

  const toggleModule = async (checked: boolean) => {
    const updated = await updateWorkflowSettings({ ...settings, quoteModuleEnabled: checked });
    setSettings(updated);
    showSuccess("Saved", checked ? "Quotes module enabled." : "Quotes module hidden from the app.");
  };

  const toggleQuote = async (checked: boolean) => {
    const updated = { ...settings, requireQuoteBeforeSalesOrder: checked };
    setSettings(updated);
    await updateWorkflowSettings(updated);
    showSuccess("Saved", checked ? "Quotes are now required before a Sales Order." : "Sales Orders can now be created directly.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Workflow Settings</h2>
        <p className="text-muted-foreground mt-1">Turn optional process steps — and entire optional modules — on or off to match how your business actually operates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales process</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <span>
              <span className="text-sm font-medium block">Enable Quotes module</span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                Off: Quotes disappears from the sidebar entirely, for businesses that don't quote. On (default): Quotes is available as normal.
              </span>
            </span>
            <Switch checked={settings.quoteModuleEnabled} onCheckedChange={toggleModule} className="shrink-0 mt-0.5" />
          </label>
          <label className={`flex items-start justify-between gap-4 ${settings.quoteModuleEnabled ? "cursor-pointer" : "opacity-50"}`}>
            <span>
              <span className="text-sm font-medium block">Require a Quote before a Sales Order</span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                On: sales staff start from a Quote, which becomes a Sales Order once accepted. Off: Sales Orders can be created directly.
              </span>
            </span>
            <Switch checked={settings.requireQuoteBeforeSalesOrder} onCheckedChange={toggleQuote} disabled={!settings.quoteModuleEnabled} className="shrink-0 mt-0.5" />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
