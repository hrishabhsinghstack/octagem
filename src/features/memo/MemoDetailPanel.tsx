import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { getItem } from "@/lib/api/inventoryApi";
import { convertMemo, extendMemo, getMemo, returnMemo } from "@/lib/api/memoApi";
import { daysFromToday, deriveMemoRisk, memoExposure, openMemoLines } from "@/lib/memo";
import { recordRecentActivity } from "@/lib/recentActivity";
import { cn, formatCurrency, formatDateShort, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { MemoRecord } from "@/types/memo";
import { ReceiptText, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function MemoDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [memo, setMemo] = useState<MemoRecord | null>(null);
  const [items, setItems] = useState<Record<string, InventoryItem>>({});
  const [newDueDate, setNewDueDate] = useState(daysFromToday(14));
  const [busy, setBusy] = useState(false);
  /** Empty means "everything still out" — the common whole-memo case needs no ticking. */
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);

  const refresh = () => {
    if (!id) return;
    setSelectedLineIds([]);
    getMemo(id).then(async (found) => {
      setMemo(found ?? null);
      if (found) {
        const resolved = await Promise.all(found.lines.map((line) => getItem(line.itemId)));
        const byId: Record<string, InventoryItem> = {};
        resolved.forEach((item) => item && (byId[item.id] = item));
        setItems(byId);
        recordRecentActivity({ type: "memo", id: found.id, label: found.id, sublabel: found.counterparty, path: `/memos/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/memos");

  if (!memo) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Memo not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const runAction = async (action: () => Promise<MemoRecord | undefined>, message: string) => {
    setBusy(true);
    await action();
    refresh();
    showSuccess("Success", message);
    setBusy(false);
  };

  const openLines = openMemoLines(memo.lines);
  // No ticks means the whole memo; passing undefined keeps that the explicit contract rather than a list that happens to match.
  const actionLineIds = selectedLineIds.length > 0 ? selectedLineIds : undefined;
  const actingOn = actionLineIds ? openLines.filter((l) => actionLineIds.includes(l.id)) : openLines;
  const isPartial = actingOn.length > 0 && actingOn.length < openLines.length;
  const selectionSuffix = isPartial ? ` (${actingOn.length} of ${openLines.length})` : "";

  const toggleLine = (lineId: string) =>
    setSelectedLineIds((current) => (current.includes(lineId) ? current.filter((x) => x !== lineId) : [...current, lineId]));

  const handleConvert = async () => {
    setBusy(true);
    const updated = await convertMemo(memo.id, actionLineIds);
    setBusy(false);
    if (!updated) return;
    const invoiceId = updated.lines.find((l) => actingOn.some((a) => a.id === l.id))?.invoiceId ?? updated.invoiceId;
    refresh();
    if (invoiceId) {
      showSuccess("Converted", isPartial ? `Invoice ${invoiceId} created; the rest of the memo stays open.` : `Invoice ${invoiceId} created.`);
      navigate(`/invoices/${invoiceId}`);
    }
  };

  const risk = memo.status === "Open" ? deriveMemoRisk(memo) : undefined;

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Memo Out · Customer custody</p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">{memo.id}</h1>
              <p className="text-muted-foreground mt-1">{memo.counterparty}</p>
              <div className="flex items-center gap-3 mt-3">
                <Badge variant={risk === "Overdue" ? "destructive" : risk === "Due soon" ? "warning" : memo.status === "Open" ? "success" : "outline"}>
                  {risk ?? memo.status}
                </Badge>
                <span className="text-sm text-muted-foreground">Exposure {formatCurrency(memoExposure(memo))}</span>
                <span className="text-sm text-muted-foreground">Due {formatDateShort(memo.dueDate)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocumentActionButtons
                shareData={{
                  title: `Memo ${memo.id}`,
                  text: `Memo ${memo.id} with ${memo.counterparty} — exposure ${formatCurrency(memoExposure(memo))}, due ${formatDateShort(memo.dueDate)}.`,
                }}
              />
              {memo.status === "Open" && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy || actingOn.length === 0}
                    onClick={() => runAction(() => returnMemo(memo.id, actionLineIds), "Items returned to receiving for inspection.")}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" /> Record return{selectionSuffix}
                  </Button>
                  <Button disabled={busy || actingOn.length === 0} onClick={handleConvert}>
                    <ReceiptText className="h-4 w-4 mr-2" /> Convert to invoice{selectionSuffix}
                  </Button>
                </>
              )}
            </div>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Lines</CardTitle>
              {memo.status === "Open" && openLines.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {selectedLineIds.length > 0 ? `${actingOn.length} selected — actions apply to these only` : "Tick lines to convert or return only part of this memo"}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {memo.status === "Open" && openLines.length > 1 && <TableHead className="w-10" />}
                    <TableHead>Item</TableHead>
                    <TableHead>Price basis</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memo.lines.map((line) => {
                    const item = items[line.itemId];
                    const selectable = memo.status === "Open" && openLines.length > 1 && !line.settledAs;
                    return (
                      <TableRow key={line.id} className={cn(line.settledAs && "text-muted-foreground")}>
                        {memo.status === "Open" && openLines.length > 1 && (
                          <TableCell>
                            {selectable && (
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={selectedLineIds.includes(line.id)}
                                onChange={() => toggleLine(line.id)}
                                aria-label={`Select ${item?.code ?? line.itemId}`}
                              />
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <span className={cn(line.settledAs && "line-through")}>{item ? `${item.code} · ${item.title}` : line.itemId}</span>
                          {line.settledAs && (
                            <Badge variant="outline" className="ml-2 font-normal">
                              {line.settledAs === "Invoiced" ? line.invoiceId ?? "Invoiced" : "Returned"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{line.priceBasis}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineTotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {memo.lines.length === 0 && <p className="text-sm text-muted-foreground py-4">No lines recorded.</p>}
              <div className="flex justify-end mt-4 text-sm">
                <span className="text-muted-foreground mr-2">Total exposure</span>
                <span className="font-semibold">{formatCurrency(memoExposure(memo))}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping &amp; terms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Memo to</p>
                  <p className="mt-0.5">{memo.contact}</p>
                  <p className="text-muted-foreground">{memo.memoToAddress}</p>
                  <p className="text-muted-foreground">{memo.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ship to</p>
                  <p className="mt-0.5">{memo.shipToAddress}</p>
                  {memo.trackingNumber && <p className="text-muted-foreground">Tracking: {memo.trackingNumber}</p>}
                </div>
                {memo.poNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground">PO #</p>
                    <p className="mt-0.5">{memo.poNumber}</p>
                  </div>
                )}
                {memo.shipVia && (
                  <div>
                    <p className="text-xs text-muted-foreground">Ship via</p>
                    <p className="mt-0.5">{memo.shipVia}</p>
                  </div>
                )}
                {memo.terms && (
                  <div>
                    <p className="text-xs text-muted-foreground">Terms</p>
                    <p className="mt-0.5">{memo.terms}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Salesperson</p>
                  <p className="mt-0.5">
                    {memo.salesperson}
                    {memo.salespersonCommissionPct ? ` (${memo.salespersonCommissionPct}%)` : ""}
                    {memo.salesperson2 && (
                      <>
                        {" + "}
                        {memo.salesperson2}
                        {memo.salesperson2CommissionPct ? ` (${memo.salesperson2CommissionPct}%)` : ""}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {memo.status === "Open" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extend due date</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="h-9 w-48" />
                  <Button variant="outline" className="shrink-0" disabled={busy} onClick={() => runAction(() => extendMemo(memo.id, newDueDate), "Memo extension recorded.")}>
                    <Undo2 className="h-4 w-4 mr-2" /> Extend
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground pt-2">Pushes the return date out for everything still in the customer's hands, and records the extension on each item's ledger.</p>
              </CardContent>
            </Card>
          )}
        </SheetContent>
      </Sheet>

      <PrintableDocument
        documentType="Memo"
        documentId={memo.id}
        date={formatDateShort(memo.issuedAt)}
        statusLabel={`${risk ?? memo.status} · Due ${formatDateShort(memo.dueDate)}`}
        counterpartyLabel="Memo to"
        counterpartyName={memo.contact}
        counterpartyAddress={memo.memoToAddress}
        fields={[
          { label: "Salesperson", value: memo.salesperson },
          ...(memo.poNumber ? [{ label: "PO #", value: memo.poNumber }] : []),
          ...(memo.shipVia ? [{ label: "Ship via", value: memo.shipVia }] : []),
          ...(memo.terms ? [{ label: "Terms", value: memo.terms }] : []),
        ]}
        lines={memo.lines.map((line) => ({ description: `${items[line.itemId]?.code ?? line.itemId} · ${items[line.itemId]?.title ?? ""} (${line.priceBasis})`, total: line.lineTotal }))}
        currency="USD"
        subtotal={memoExposure(memo)}
        total={memoExposure(memo)}
      />
    </>
  );
}
