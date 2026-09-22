import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordVendorPaymentDialog } from "@/features/purchasing/RecordVendorPaymentDialog";
import { getVendor } from "@/lib/api/vendorApi";
import { getVendorBill, listVendorPaymentsForBill, voidVendorBill } from "@/lib/api/vendorBillApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort, showSuccess } from "@/lib/utils";
import type { Vendor } from "@/types/party";
import type { VendorBill, VendorBillStatus } from "@/types/vendorBill";
import type { VendorPayment } from "@/types/vendorPayment";
import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const STATUS_VARIANT: Record<VendorBillStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

export function VendorBillDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bill, setBill] = useState<VendorBill | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const refresh = () => {
    if (!id) return;
    getVendorBill(id).then(async (found) => {
      setBill(found ?? null);
      if (found) {
        const foundVendor = (await getVendor(found.vendorId)) ?? null;
        setVendor(foundVendor);
        setPayments(await listVendorPaymentsForBill(found.id));
        recordRecentActivity({ type: "vendorBill", id: found.id, label: found.id, sublabel: foundVendor?.name, path: `/vendor-bills/${found.id}` });
      }
    });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/vendor-bills");

  if (!bill) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Vendor bill not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  const remaining = bill.total - bill.paidAmount;

  const handleVoid = async () => {
    if (!window.confirm(`Void ${bill.id}?`)) return;
    await voidVendorBill(bill.id);
    showSuccess("Voided", `${bill.id} marked void.`);
    refresh();
  };

  return (
    <Sheet open onOpenChange={(next) => !next && close()}>
      <SheetContent size="formLg" className="p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Vendor Bill · Consignment sale ·{" "}
              <Link to={`/invoices/${bill.sourceId}`} className="text-primary hover:underline">
                {bill.sourceId}
              </Link>
            </p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{bill.id}</h1>
            <p className="text-muted-foreground mt-1">{vendor?.name ?? bill.vendorId}</p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant={STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
              <span className="text-sm text-muted-foreground">Issued {formatDateShort(bill.issuedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {bill.status !== "Paid" && bill.status !== "Void" && (
              <Button onClick={() => setPaymentOpen(true)}>
                <CreditCard className="h-4 w-4 mr-2" /> Record payment
              </Button>
            )}
            {bill.status !== "Void" && (
              <Button variant="outline" onClick={handleVoid}>
                Void
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
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bill.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Link to={`/inventory/${line.itemId}`} className="hover:underline">
                        {line.description}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(line.lineTotal, bill.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col items-end gap-1 mt-4 text-sm">
              <div className="flex gap-8 font-semibold">
                <span>Total</span>
                <span>{formatCurrency(bill.total, bill.currency)}</span>
              </div>
              <div className="flex gap-8 text-emerald-600">
                <span>Paid</span>
                <span>{formatCurrency(bill.paidAmount, bill.currency)}</span>
              </div>
              <div className="flex gap-8 font-semibold">
                <span>Balance</span>
                <span>{formatCurrency(remaining, bill.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length > 0 ? (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                    <span>
                      {payment.method} {payment.reference && `· ${payment.reference}`}
                    </span>
                    <span className="text-muted-foreground">{formatDateShort(payment.paidAt)}</span>
                    <span className="font-medium">{formatCurrency(payment.amount, bill.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <RecordVendorPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} bill={bill} onRecorded={refresh} />
      </SheetContent>
    </Sheet>
  );
}
