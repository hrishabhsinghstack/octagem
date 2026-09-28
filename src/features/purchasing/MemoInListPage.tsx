import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateMemoInDialog } from "@/features/purchasing/CreateMemoInDialog";
import { listMemoIns } from "@/lib/api/memoInApi";
import { listVendors } from "@/lib/api/vendorApi";
import { formatDateShort } from "@/lib/utils";
import type { MemoInRecord, MemoInStatus } from "@/types/memoIn";
import type { Vendor } from "@/types/party";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const STATUS_VARIANT: Record<MemoInStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "outline",
  "Partially received": "warning",
  Received: "success",
};

/**
 * Vendor consignment in, under Purchasing — the buy-side twin of the customer Memo register under
 * Sales. The two were one tabbed page; they were split because a Memo In is a purchasing concern
 * (it feeds the consignment receive and the vendor bill raised when the goods sell), and grouping it
 * with customer custody made it invisible to the people who work it.
 */
export function MemoInListPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<MemoInRecord[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listMemoIns().then(setRecords);
    listVendors().then((list) => setVendors(Object.fromEntries(list.map((v) => [v.id, v]))));
  };

  useEffect(refresh, []);

  const open = records.filter((r) => r.status !== "Received");

  return (
    <>
      <div className="p-8 space-y-6 max-w-[1400px] print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Memo In</h1>
            <p className="text-muted-foreground mt-1">Vendor consignment — goods in your custody, not your ownership, until sold or returned.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Memo In
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Open consignments</p>
            <p className="text-2xl font-semibold mt-1">{open.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{records.length - open.length} fully received</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Lines awaiting receipt</p>
            <p className="text-2xl font-semibold mt-1">
              {open.reduce((sum, r) => sum + r.lines.reduce((s, l) => s + Math.max(0, l.expectedQty - l.receivedQty), 0), 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Across {open.length} open records</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Vendors on consignment</p>
            <p className="text-2xl font-semibold mt-1">{new Set(open.map((r) => r.vendorId)).size}</p>
            <p className="text-xs text-muted-foreground mt-1">Goods held from these suppliers</p>
          </Card>
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
                <TableRow key={record.id} className="cursor-pointer" onClick={() => navigate(`/memo-in/${record.id}`)}>
                  <TableCell className="font-medium">{record.id}</TableCell>
                  <TableCell>{vendors[record.vendorId]?.name ?? record.counterparty}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {record.lines.reduce((s, l) => s + l.receivedQty, 0)} / {record.lines.reduce((s, l) => s + l.expectedQty, 0)} received
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(record.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {records.length === 0 && <div className="py-16 text-center text-muted-foreground">No Memo In records yet.</div>}
        </Card>

        <CreateMemoInDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
      </div>
      <Outlet />
    </>
  );
}
