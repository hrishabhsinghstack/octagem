import type { PaymentMethod } from "@/types/payment";

/** AP's mirror of Payment (§18) — one payment against one vendor bill at a time, partials supported, same simplification as the AR side. */
export interface VendorPayment {
  id: string;
  vendorBillId: string;
  vendorId: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  paidAt: string;
}
