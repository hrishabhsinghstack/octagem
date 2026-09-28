import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReceiveItemDialog } from "@/features/inventory/ReceiveItemDialog";
import { getMemoIn, recordLineReceipt } from "@/lib/api/memoInApi";
import { getVendor } from "@/lib/api/vendorApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatDateShort, showSuccess } from "@/lib/utils";
import type { MemoInLine, MemoInRecord, MemoInStatus } from "@/types/memoIn";
import type { Vendor } from "@/types/party";
import { PackagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const STATUS_VARIANT: Record<MemoInStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "outline",
  "Partially received": "warning",
  Received: "success",
};

export function MemoInDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<MemoInRecord | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [receivingLine, setReceivingLine] = useState<MemoInLine | null>(null);

  const refresh = () => {
    if (!id) return;
    getMemoIn(id).then(async (found) => {
      setRecord(found ?? null);
      if (found) {
        const foundVendor = (await getVendor(found.vendorId)) ?? null;
        setVendor(foundVendor);
        recordRecentActivity({ type: "memoIn", id: found.id, label: found.id, sublabel: foundVendor?.name ?? found.counterparty, path: `/memo-in/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/memo-in");

  if (!record) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Memo In record not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const handleReceived = async (item?: { id: string }) => {
    if (item && receivingLine) {
      await recordLineReceipt(record.id, receivingLine.id, item.id);
      showSuccess("Received", `${item.id} received on consignment.`);
    }
    setReceivingLine(null);
    refresh();
  };

  return (
    <Sheet open onOpenChange={(next) => !next && close()}>
      <SheetContent size="formLg" className="p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Memo In · Vendor consignment</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{record.id}</h1>
            <p className="text-muted-foreground mt-1">{vendor?.name ?? record.counterparty}</p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
              <span className="text-sm text-muted-foreground">Due back {formatDateShort(record.dueDate)}</span>
              {record.vendorRef && <span className="text-sm text-muted-foreground">Vendor ref {record.vendorRef}</span>}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price basis</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead>Received items</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {record.lines.map((line) => {
                  const fullyReceived = line.receivedQty >= line.expectedQty;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.category}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.priceBasis}</TableCell>
                      <TableCell className="text-right">{line.expectedQty}</TableCell>
                      <TableCell className="text-right">
                        {line.receivedQty} / {line.expectedQty}
                      </TableCell>
                      <TableCell className="text-xs">
                        {line.receivedItemIds.map((itemId, index) => (
                          <span key={itemId}>
                            {index > 0 && ", "}
                            <Link to={`/inventory/${itemId}`} className="text-primary hover:underline">
                              {itemId}
                            </Link>
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" disabled={fullyReceived} onClick={() => setReceivingLine(line)}>
                          <PackagePlus className="h-3.5 w-3.5 mr-1.5" /> Receive
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {record.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{record.notes}</p>
            </CardContent>
          </Card>
        )}

        <ReceiveItemDialog
          open={Boolean(receivingLine)}
          onOpenChange={(open) => !open && setReceivingLine(null)}
          onSaved={handleReceived}
          prefill={
            receivingLine
              ? { vendorId: record.vendorId, memoInId: record.id, category: receivingLine.category, priceBasis: receivingLine.priceBasis }
              : undefined
          }
        />
      </SheetContent>
    </Sheet>
  );
}
