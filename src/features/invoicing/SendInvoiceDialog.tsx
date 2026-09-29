import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { recordInvoiceSend } from "@/lib/api/invoiceApi";
import { getBusinessProfile } from "@/lib/api/settingsApi";
import { invoiceBalance } from "@/lib/invoice";
import { formatCurrency, formatDateShort, showError, showSuccess } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import type { Customer } from "@/types/party";
import { ExternalLink, Info } from "lucide-react";
import { useEffect, useState } from "react";

interface SendInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  customer: Customer | null;
  onSent: () => void;
}

/**
 * Composes the covering email and hands it to the user's own mail client. There is no mail backend, so
 * the app can only confirm the handoff — never delivery — and cannot attach the PDF; the dialog says so
 * rather than implying a send happened. The recorded InvoiceSend is the part a real transport would
 * later reuse unchanged.
 */
export function SendInvoiceDialog({ open, onOpenChange, invoice, customer, onSent }: SendInvoiceDialogProps) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  const balance = invoiceBalance(invoice);
  const isResend = invoice.sends.length > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    getBusinessProfile().then((profile) => {
      if (cancelled) return;
      const company = profile.companyName || "us";
      setCompanyName(company);
      setSubject(`Invoice ${invoice.id} from ${company}`);
      setBody(
        [
          `Dear ${customer?.contact || customer?.name || "customer"},`,
          "",
          `Please find invoice ${invoice.id} attached, dated ${formatDateShort(invoice.issuedAt)}.`,
          "",
          `Amount due: ${formatCurrency(balance, invoice.currency)}`,
          `Payment due by: ${formatDateShort(invoice.dueDate)}`,
          "",
          invoice.notes ? `${invoice.notes}\n` : "",
          "Thank you for your business.",
          "",
          company,
        ]
          .filter((part) => part !== undefined)
          .join("\n")
      );
    });

    setTo(customer?.email ?? "");
    setCc("");

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice.id, customer?.email]);

  const handleSend = async () => {
    if (!to.trim()) {
      showError("Recipient required", "Enter the email address to send this invoice to.");
      return;
    }

    setSaving(true);
    try {
      // Record first: if the mail client fails to open, the user has still been told what was recorded,
      // rather than the app claiming a send it never logged.
      await recordInvoiceSend(invoice.id, { to: to.trim(), cc: cc.trim() || undefined, subject, via: "mailto" });

      const params = new URLSearchParams({ subject, body });
      if (cc.trim()) params.set("cc", cc.trim());
      window.open(`mailto:${encodeURIComponent(to.trim())}?${params.toString().replace(/\+/g, "%20")}`, "_self");

      showSuccess(isResend ? "Resend recorded" : "Marked as sent", `${invoice.id} logged as sent to ${to.trim()}. Attach the PDF in your mail client before sending.`);
      onOpenChange(false);
      onSent();
    } catch (error: any) {
      showError("Could not record the send", error?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="form" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isResend ? "Resend" : "Send"} {invoice.id}
            {companyName ? "" : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3 flex-1 overflow-y-auto">
          {isResend && (
            <p className="text-xs text-muted-foreground">
              Already sent {invoice.sends.length}× — most recently to {invoice.sends[invoice.sends.length - 1]?.to}.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="send-to" className="text-xs text-muted-foreground">
                To<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="send-cc" className="text-xs text-muted-foreground">
                Cc
              </Label>
              <Input id="send-cc" type="email" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="send-subject" className="text-xs text-muted-foreground">
              Subject
            </Label>
            <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="send-body" className="text-xs text-muted-foreground">
              Message
            </Label>
            <Textarea id="send-body" value={body} onChange={(e) => setBody(e.target.value)} rows={11} className="resize-none font-mono text-xs" />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>
              This opens your own mail client with the message ready to go, and logs the send against the invoice. It cannot attach the PDF for you — use{" "}
              <span className="font-medium text-foreground">Download</span> on the invoice first, then attach the file before sending.
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={saving}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {saving ? "Recording…" : "Open mail client"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
