import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { listVendors } from "@/lib/api/vendorApi";
import { listVendorBills } from "@/lib/api/vendorBillApi";
import { formatCurrency } from "@/lib/utils";
import type { Vendor } from "@/types/party";
import type { VendorBill, VendorBillStatus } from "@/types/vendorBill";
import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const STATUS_VARIANT: Record<VendorBillStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

export function VendorBillListPage() {
  const navigate = useNavigate();
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});

  const refresh = () => {
    listVendorBills().then(setBills);
    listVendors().then((list) => setVendors(Object.fromEntries(list.map((v) => [v.id, v]))));
  };
  useDataRefresh(refresh);

  const openBalance = bills.filter((b) => b.status !== "Void").reduce((sum, b) => sum + (b.total - b.paidAmount), 0);

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendor Bills</h1>
        <p className="text-muted-foreground mt-1">Created automatically when a consigned item sells — this is what you owe vendors for Memo In goods.</p>
      </div>

      <Card className="p-5 w-fit">
        <p className="text-xs text-muted-foreground">Open payable balance</p>
        <p className="text-2xl font-semibold mt-1">{formatCurrency(openBalance)}</p>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((bill) => (
              <TableRow key={bill.id} className="cursor-pointer" onClick={() => navigate(`/vendor-bills/${bill.id}`)}>
                <TableCell className="font-medium">{bill.id}</TableCell>
                <TableCell>{vendors[bill.vendorId]?.name ?? bill.vendorId}</TableCell>
                <TableCell className="text-right">{formatCurrency(bill.total, bill.currency)}</TableCell>
                <TableCell className="text-right text-emerald-600">{formatCurrency(bill.paidAmount, bill.currency)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(bill.total - bill.paidAmount, bill.currency)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {bills.length === 0 && <div className="py-16 text-center text-muted-foreground">No vendor bills yet — these appear automatically when a consigned item sells.</div>}
      </Card>
    </div>
    <Outlet />
    </>
  );
}
