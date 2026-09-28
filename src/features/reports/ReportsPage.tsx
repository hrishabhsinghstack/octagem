import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const PLANNED_REPORTS = [
  { title: "Inventory aging", description: "How long stock has sat by category, location, and value band." },
  { title: "Memo aging", description: "Outstanding memo exposure by customer/vendor, days outstanding, and risk band." },
  { title: "Sales performance", description: "Revenue and margin by category, salesperson, and customer; memo-to-invoice conversion." },
  { title: "Purchasing", description: "Spend by vendor, PO fulfilment lag, receiving accuracy." },
  { title: "Outstanding balances", description: "AR/AP aging buckets once vendor bills exist." },
  { title: "GMROI, turn & sell-through", description: "The core inventory-efficiency KPIs this trade actually manages by." },
];

/** Placeholder — no report computation exists yet. Listed honestly so the sidebar entry isn't misleading; wired up once Reports & Analytics (blueprint §28) is built. */
export function ReportsPage() {
  return (
    <div className="p-8 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">Not built yet — this is what's planned.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLANNED_REPORTS.map((report) => (
          <Card key={report.title}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <BarChart3 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <CardTitle className="text-base">{report.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{report.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
