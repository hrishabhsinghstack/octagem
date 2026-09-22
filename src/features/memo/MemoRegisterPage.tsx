import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueMemoDialog } from "@/features/memo/IssueMemoDialog";
import { CreateMemoInDialog } from "@/features/purchasing/CreateMemoInDialog";
import { listMemos } from "@/lib/api/memoApi";
import { listMemoIns } from "@/lib/api/memoInApi";
import { listVendors } from "@/lib/api/vendorApi";
import { deriveMemoRisk, memoExposure } from "@/lib/memo";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { MemoRecord, MemoRisk } from "@/types/memo";
import type { MemoInRecord, MemoInStatus } from "@/types/memoIn";
import type { Vendor } from "@/types/party";
import { Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const RISK_VARIANT: Record<MemoRisk, "success" | "warning" | "destructive"> = {
  Healthy: "success",
  "Due soon": "warning",
  Overdue: "destructive",
};

const MEMO_IN_STATUS_VARIANT: Record<MemoInStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "outline",
  "Partially received": "warning",
  Received: "success",
};

function MemoOutTab() {
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-muted-foreground">Items sent to customers on custody — not ownership, inventory value, or revenue.</p>
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
  );
}

function MemoInTab() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<MemoInRecord[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listMemoIns().then(setRecords);
    listVendors().then((list) => setVendors(Object.fromEntries(list.map((v) => [v.id, v]))));
  };

  useEffect(refresh, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-muted-foreground">Vendor consignment — goods in your custody, not your ownership, until sold or returned.</p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Memo In
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Memo In #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Due back</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} className="cursor-pointer" onClick={() => navigate(`/memos/in/${record.id}`)}>
                <TableCell className="font-medium">{record.id}</TableCell>
                <TableCell>{vendors[record.vendorId]?.name ?? record.counterparty}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {record.lines.reduce((s, l) => s + l.receivedQty, 0)} / {record.lines.reduce((s, l) => s + l.expectedQty, 0)} received
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateShort(record.dueDate)}</TableCell>
                <TableCell>
                  <Badge variant={MEMO_IN_STATUS_VARIANT[record.status]}>{record.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {records.length === 0 && <div className="py-16 text-center text-muted-foreground">No Memo In records yet.</div>}
      </Card>

      <CreateMemoInDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
  );
}

export function MemoRegisterPage() {
  const location = useLocation();
  const onMemoIn = location.pathname.startsWith("/memos/in");
  const [manualTab, setManualTab] = useState<"out" | "in" | null>(null);
  const activeTab = onMemoIn ? "in" : manualTab ?? "out";

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1400px] print:hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memo</h1>
        <p className="text-muted-foreground mt-1">Custody transfers, in both directions — goods sent to customers and goods received from vendors on consignment.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setManualTab(v as "out" | "in")}>
        <TabsList>
          <TabsTrigger value="out">Memo Out</TabsTrigger>
          <TabsTrigger value="in">Memo In</TabsTrigger>
        </TabsList>
        <TabsContent value="out" className="mt-4">
          <MemoOutTab />
        </TabsContent>
        <TabsContent value="in" className="mt-4">
          <MemoInTab />
        </TabsContent>
      </Tabs>
    </div>
    <Outlet />
    </>
  );
}
