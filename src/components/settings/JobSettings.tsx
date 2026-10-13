import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getJobSettings, updateJobSettings } from "@/lib/api/settingsApi";
import { showError, showSuccess } from "@/lib/utils";
import { useEffect, useState } from "react";

/** Defaults for jewelry job work. Each new job and invoice copies them, so changing them never re-costs existing jobs. */
export function JobSettings() {
  const [taxRecoverable, setTaxRecoverable] = useState(true);
  const [overheadPct, setOverheadPct] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJobSettings().then((s) => {
      setTaxRecoverable(s.purchaseTaxRecoverable);
      setOverheadPct(String(s.defaultOverheadPct));
    });
  }, []);

  const handleSave = async () => {
    const pct = Number(overheadPct);
    if (!(pct >= 0 && pct <= 100)) {
      showError("Invalid overhead", "Overhead must be between 0% and 100%.");
      return;
    }
    setSaving(true);
    await updateJobSettings({ purchaseTaxRecoverable: taxRecoverable, defaultOverheadPct: pct });
    setSaving(false);
    showSuccess("Saved", "Job order defaults updated.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Job Orders</h2>
        <p className="text-muted-foreground mt-1">Defaults for jewelry job work. New jobs and invoices start from these; each can still be changed on its own.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costing defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3">
            <Switch checked={taxRecoverable} onCheckedChange={setTaxRecoverable} id="job-tax-recoverable" className="mt-0.5" />
            <div>
              <Label htmlFor="job-tax-recoverable">Purchase tax can be claimed back</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                When on, GST/VAT on vendor invoices is recorded but kept off product cost, because you reclaim it. Turn off if you can't claim it back — it then becomes part of the job's cost.
              </p>
            </div>
          </div>
          <div className="max-w-xs">
            <Label className="text-sm">Default workshop overhead %</Label>
            <Input inputMode="decimal" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)} className="mt-1" />
            <p className="text-sm text-muted-foreground mt-1">Added on top of each new job's costs. 0 for none.</p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
