import { RequirePermission } from "@/components/layout/RequirePermission";
import { CustomerDetailPanel } from "@/features/customers/CustomerDetailPanel";
import { CustomerListPage } from "@/features/customers/CustomerListPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { PaymentsListPage } from "@/features/finance/PaymentsListPage";
import { InventoryListPage } from "@/features/inventory/InventoryListPage";
import { ItemDetailPanel } from "@/features/inventory/ItemDetailPanel";
import { InvoiceDetailPanel } from "@/features/invoicing/InvoiceDetailPanel";
import { InvoiceListPage } from "@/features/invoicing/InvoiceListPage";
import { MemoDetailPanel } from "@/features/memo/MemoDetailPanel";
import { MemoRegisterPage } from "@/features/memo/MemoRegisterPage";
import { MemoInDetailPanel } from "@/features/purchasing/MemoInDetailPanel";
import { MemoInListPage } from "@/features/purchasing/MemoInListPage";
import { PurchaseOrderDetailPanel } from "@/features/purchasing/PurchaseOrderDetailPanel";
import { PurchaseOrderListPage } from "@/features/purchasing/PurchaseOrderListPage";
import { VendorBillDetailPanel } from "@/features/purchasing/VendorBillDetailPanel";
import { VendorBillListPage } from "@/features/purchasing/VendorBillListPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { VendorDetailPanel } from "@/features/vendors/VendorDetailPanel";
import { VendorListPage } from "@/features/vendors/VendorListPage";
import { Route, Routes } from "react-router-dom";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />

      <Route path="/inventory" element={<RequirePermission module="inventory"><InventoryListPage /></RequirePermission>}>
        <Route path=":id" element={<ItemDetailPanel />} />
      </Route>

      <Route path="/memos" element={<RequirePermission module="memoOut"><MemoRegisterPage /></RequirePermission>}>
        <Route path=":id" element={<MemoDetailPanel />} />
      </Route>

      <Route path="/memo-in" element={<RequirePermission module="memoIn"><MemoInListPage /></RequirePermission>}>
        <Route path=":id" element={<MemoInDetailPanel />} />
      </Route>

      <Route path="/invoices" element={<RequirePermission module="invoices"><InvoiceListPage /></RequirePermission>}>
        <Route path=":id" element={<InvoiceDetailPanel />} />
      </Route>

      <Route path="/customers" element={<RequirePermission module="customers"><CustomerListPage /></RequirePermission>}>
        <Route path=":id" element={<CustomerDetailPanel />} />
      </Route>

      <Route path="/vendors" element={<RequirePermission module="vendors"><VendorListPage /></RequirePermission>}>
        <Route path=":id" element={<VendorDetailPanel />} />
      </Route>

      <Route path="/purchase-orders" element={<RequirePermission module="purchaseOrders"><PurchaseOrderListPage /></RequirePermission>}>
        <Route path=":id" element={<PurchaseOrderDetailPanel />} />
      </Route>

      <Route path="/payments" element={<RequirePermission module="payments"><PaymentsListPage /></RequirePermission>} />

      <Route path="/vendor-bills" element={<RequirePermission module="vendorBills"><VendorBillListPage /></RequirePermission>}>
        <Route path=":id" element={<VendorBillDetailPanel />} />
      </Route>

      <Route path="/reports" element={<RequirePermission module="reports"><ReportsPage /></RequirePermission>} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
