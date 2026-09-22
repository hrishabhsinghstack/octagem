import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentActionButtons } from "@/components/documents/DocumentActionButtons";
import { PrintableDocument } from "@/components/documents/PrintableDocument";
import { getItem } from "@/lib/api/inventoryApi";
import { getCustomer } from "@/lib/api/customerApi";
import { acceptQuote, declineQuote, getQuote } from "@/lib/api/quoteApi";
import { getTaxRatePercent } from "@/lib/currency";
import { getList } from "@/lib/store/masterDataStore";
import { isQuoteExpired } from "@/lib/quote";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort, showSuccess } from "@/lib/utils";
import type { InventoryItem } from "@/types/inventory";
import type { Quote } from "@/types/quote";
import type { Customer } from "@/types/party";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function QuoteDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<Record<string, InventoryItem>>({});
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    if (!id) return;
    getQuote(id).then(async (found) => {
      setQuote(found ?? null);
      if (found) {
        const foundCustomer = (await getCustomer(found.customerId)) ?? null;
        setCustomer(foundCustomer);
        const resolved = await Promise.all(found.lines.map((l) => getItem(l.itemId)));
        const byId: Record<string, InventoryItem> = {};
        resolved.forEach((item) => item && (byId[item.id] = item));
        setItems(byId);
        recordRecentActivity({ type: "quote", id: found.id, label: found.id, sublabel: foundCustomer?.name, path: `/quotes/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/quotes");

  if (!quote) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Quote not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const subtotal = quote.lines.reduce((s, l) => s + l.lineTotal, 0);
  const taxPercent = getTaxRatePercent(quote.taxRateId);
  const tax = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const total = subtotal + tax;
  const expired = isQuoteExpired(quote);
  const taxRateLabel = quote.taxRateId ? getList("taxRates", false).find((t) => t.id === quote.taxRateId)?.label : undefined;

  const handleAccept = async () => {
    setBusy(true);
    const updated = await acceptQuote(quote.id);
    setBusy(false);
    if (updated?.salesOrderId) {
      showSuccess("Quote accepted", `Sales Order ${updated.salesOrderId} created.`);
      navigate(`/sales-orders/${updated.salesOrderId}`);
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    await declineQuote(quote.id);
    setBusy(false);
    showSuccess("Quote declined", `${quote.id} closed.`);
    refresh();
  };

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Quote</p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">{quote.id}</h1>
              <p className="text-muted-foreground mt-1">{customer?.name ?? quote.customerId}</p>
              <div className="flex items-center gap-3 mt-3">
                {quote.status === "Open" ? (
                  <Badge variant={expired ? "destructive" : "secondary"}>{expired ? "Expired" : "Open"}</Badge>
                ) : (
                  <Badge variant={quote.status === "Accepted" ? "success" : "outline"}>{quote.status}</Badge>
                )}
                <span className="text-sm text-muted-foreground">Expires {formatDateShort(quote.expiresAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocumentActionButtons
                shareData={{
                  title: `Quote ${quote.id}`,
                  text: `Quote ${quote.id} for ${customer?.name ?? quote.customerId} — total ${formatCurrency(total, quote.currency)}.`,
                }}
              />
              {quote.status === "Open" && (
                <>
                  <Button variant="outline" onClick={handleDecline} disabled={busy}>
                    <X className="h-4 w-4 mr-2" /> Decline
                  </Button>
                  <Button onClick={handleAccept} disabled={busy}>
                    <Check className="h-4 w-4 mr-2" /> Accept &amp; create Sales Order
                  </Button>
                </>
              )}
              {quote.status === "Accepted" && quote.salesOrderId && (
                <Button variant="outline" onClick={() => navigate(`/sales-orders/${quote.salesOrderId}`)}>
                  View Sales Order {quote.salesOrderId}
                </Button>
              )}
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
                    <TableHead>Item</TableHead>
                    <TableHead>Price basis</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.lines.map((line) => {
                    const item = items[line.itemId];
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{item ? `${item.code} · ${item.title}` : line.itemId}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{line.priceBasis}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineTotal, quote.currency)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col items-end gap-1 mt-4 text-sm">
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal, quote.currency)}</span>
                </div>
                {tax > 0 && (
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Tax{taxRateLabel ? ` (${taxRateLabel})` : ""}</span>
                    <span>{formatCurrency(tax, quote.currency)}</span>
                  </div>
                )}
                <div className="flex gap-8 font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(total, quote.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </SheetContent>
      </Sheet>

      <PrintableDocument
        documentType="Quote"
        documentId={quote.id}
        date={formatDateShort(quote.issuedAt)}
        statusLabel={`${quote.status} · Expires ${formatDateShort(quote.expiresAt)}`}
        counterpartyLabel="Quote for"
        counterpartyName={customer?.name ?? quote.customerId}
        counterpartyAddress={customer?.address}
        fields={[{ label: "Salesperson", value: quote.salesperson }]}
        lines={quote.lines.map((line) => ({ description: `${items[line.itemId]?.code ?? line.itemId} · ${items[line.itemId]?.title ?? ""} (${line.priceBasis})`, total: line.lineTotal }))}
        currency={quote.currency}
        subtotal={subtotal}
        tax={tax}
        taxLabel={taxRateLabel ? `Tax (${taxRateLabel})` : "Tax"}
        total={total}
        notes={quote.notes}
      />
    </>
  );
}
