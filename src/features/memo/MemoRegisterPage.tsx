import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IssueMemoDialog } from "@/features/memo/IssueMemoDialog";
import { listMemos } from "@/lib/api/memoApi";
import { deriveMemoRisk, memoExposure } from "@/lib/memo";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { MemoRecord, MemoRisk } from "@/types/memo";
import { Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const RISK_VARIANT: Record<MemoRisk, "success" | "warning" | "destructive"> = {
  Healthy: "success",
  "Due soon": "warning",
  Overdue: "destructive",
};

/**
 * Customer memo — items in someone else's hands that are still yours. One of the two sales documents
 * (the other is the Invoice); converting a memo is one of the two ways an invoice comes into being.
 * Vendor consignment lives separately under Purchasing — see features/purchasing/MemoInListPage.
 */
export function MemoRegisterPage() {
  const navigate = useNavigate();
  const [memos, setMemos] = useState<MemoRecord[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);

  const refresh = () => listMemos().then(setMemos);

  useEffect(() => {
    refresh();
  }, []);

  const open = memos.filter((m) => m.status === "Open");
  const totalExposure = open.reduce((sum, m) => sum + memoExposure(m), 0);
  const overdueExposure = useMemo(
    () => open.filter((m) => deriveMemoRisk(m) === "Overdue").reduce((sum, m) => sum + memoExposure(m), 0),
    [open]
  );

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1400px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memo</h1>
          <p className="text-muted-foreground mt-1">Items sent to customers on custody — not ownership, inventory value, or revenue.</p>
        </div>
        <Button onClick={() => setIssueOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Issue customer memo
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Assets held by others</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalExposure)}</p>
          <p className="text-xs text-muted-foreground mt-1">{open.length} active customer memos</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Overdue exposure</p>
          <p className="text-2xl font-semibold mt-1 text-destructive">{formatCurrency(overdueExposure)}</p>
          <p className="text-xs text-muted-foreground mt-1">Prioritise return, extension, or conversion</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Open memos</p>
          <p className="text-2xl font-semibold mt-1">{open.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{memos.length - open.length} returned or converted</p>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Memo</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Exposure</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memos.map((memo) => {
              const risk = deriveMemoRisk(memo);
              return (
                <TableRow key={memo.id} className="cursor-pointer" onClick={() => navigate(`/memos/${memo.id}`)}>
                  <TableCell className="font-medium">{memo.id}</TableCell>
                  <TableCell>{memo.counterparty}</TableCell>
                  <TableCell className="text-muted-foreground">{memo.lines.length}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(memoExposure(memo))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(memo.dueDate)}</TableCell>
                  <TableCell>{memo.status === "Open" ? <Badge variant={RISK_VARIANT[risk]}>{risk}</Badge> : <Badge variant="outline">{memo.status}</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {memos.length === 0 && <div className="py-16 text-center text-muted-foreground">No customer memos yet.</div>}
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <p>Memo items remain on the balance sheet, retain their original cost, and stay traceable to the current custodian. Conversion to a sale happens as a separate, explicit step.</p>
      </div>

      <IssueMemoDialog open={issueOpen} onOpenChange={setIssueOpen} onIssued={refresh} />
    </div>
    <Outlet />
    </>
  );
}
