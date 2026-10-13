import type { JobLedgerSource } from "@/lib/job/costing";
import type { JobStatus, JobType } from "@/types/jobOrder";
import type { PurchaseDocumentType, PurchaseOrderLineType } from "@/types/purchaseOrder";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

export const JOB_STATUSES: JobStatus[] = ["Open", "In production", "Completed", "Cancelled"];

export const JOB_STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  Open: "outline",
  "In production": "warning",
  Completed: "success",
  Cancelled: "destructive",
};

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  Production: "Production for stock",
  CustomerOrder: "Customer order",
  Rework: "Rework of stock",
};

export const JOB_TYPE_HELP: Record<JobType, string> = {
  Production: "Make new pieces to sell later.",
  CustomerOrder: "Make a piece ordered by a customer.",
  Rework: "Remake, upgrade or refinish pieces already in stock.",
};

export const DOCUMENT_TYPE_LABEL: Record<PurchaseDocumentType, string> = {
  PurchaseOrder: "Purchase order",
  VendorInvoice: "Vendor invoice",
  CreditNote: "Credit note",
};

export const DOCUMENT_TYPE_VARIANT: Record<PurchaseDocumentType, BadgeVariant> = {
  PurchaseOrder: "outline",
  VendorInvoice: "secondary",
  CreditNote: "warning",
};

export const LEDGER_SOURCE_LABEL: Record<JobLedgerSource, string> = {
  PurchaseOrder: "Purchase order",
  VendorInvoice: "Invoice",
  CreditNote: "Credit note",
  Internal: "Internal",
  StockConsumption: "From stock",
  ReturnToStock: "Back to stock",
  Loss: "Loss",
  Variance: "Variance",
  Overhead: "Overhead",
};

export const LINE_TYPE_LABEL: Record<PurchaseOrderLineType, string> = {
  Goods: "Goods",
  Metal: "Metal",
  Service: "Service",
};
