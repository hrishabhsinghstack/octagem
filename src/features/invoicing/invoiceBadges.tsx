import { Badge } from "@/components/ui/badge";
import { isSent } from "@/lib/invoice";
import { formatDateShort } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import { MailCheck, MailWarning } from "lucide-react";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

/**
 * Shared so the list, the detail panel and the customer panel cannot drift apart on what a status
 * looks like. Draft is deliberately the quietest of the five — it is the one state that means nothing
 * has happened yet.
 */
export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  Draft: "outline",
  Open: "warning",
  "Partially paid": "secondary",
  Paid: "success",
  Void: "destructive",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={INVOICE_STATUS_VARIANT[status]}>{status}</Badge>;
}

/**
 * Sent-ness as its own badge, because it is a flag rather than a status — an invoice can be both
 * Partially paid and never sent, which a single badge could not say. Drafts show nothing: not having
 * sent something you haven't issued isn't an omission.
 */
export function InvoiceSentBadge({ invoice }: { invoice: Pick<Invoice, "status" | "sentAt" | "sends"> }) {
  if (invoice.status === "Draft" || invoice.status === "Void") return null;

  if (!isSent(invoice)) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground font-normal">
        <MailWarning className="h-3 w-3" /> Not sent
      </Badge>
    );
  }

  const count = invoice.sends.length;
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <MailCheck className="h-3 w-3 text-emerald-600" />
      Sent {invoice.sentAt ? formatDateShort(invoice.sentAt.slice(0, 10)) : ""}
      {count > 1 ? ` · ${count}×` : ""}
    </Badge>
  );
}
