import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateQuoteDialog } from "@/features/quotes/CreateQuoteDialog";
import { listQuotes } from "@/lib/api/quoteApi";
import { listCustomers } from "@/lib/api/customerApi";
import { isQuoteExpired } from "@/lib/quote";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { Quote } from "@/types/quote";
import type { Customer } from "@/types/party";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

export function QuoteListPage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => {
    listQuotes().then(setQuotes);
    listCustomers().then((list) => setCustomers(Object.fromEntries(list.map((c) => [c.id, c]))));
  };
  useEffect(refresh, []);

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground mt-1">Proposals that don't commit inventory until accepted.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New quote
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((quote) => {
              const total = quote.lines.reduce((s, l) => s + l.lineTotal, 0);
              const expired = isQuoteExpired(quote);
              return (
                <TableRow key={quote.id} className="cursor-pointer" onClick={() => navigate(`/quotes/${quote.id}`)}>
                  <TableCell className="font-medium">{quote.id}</TableCell>
                  <TableCell>{customers[quote.customerId]?.name ?? quote.customerId}</TableCell>
                  <TableCell className="text-muted-foreground">{quote.lines.length}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(quote.expiresAt)}</TableCell>
                  <TableCell>
                    {quote.status === "Open" ? (
                      <Badge variant={expired ? "destructive" : "secondary"}>{expired ? "Expired" : "Open"}</Badge>
                    ) : (
                      <Badge variant={quote.status === "Accepted" ? "success" : "outline"}>{quote.status}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {quotes.length === 0 && <div className="py-16 text-center text-muted-foreground">No quotes yet.</div>}
      </Card>

      <CreateQuoteDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
    <Outlet />
    </>
  );
}
