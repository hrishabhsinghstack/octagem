import { useBranding } from "@/contexts/brandingContext";
import { getBusinessProfile } from "@/lib/api/settingsApi";
import { formatCurrency } from "@/lib/utils";
import type { BusinessProfile } from "@/types/settings";
import { Gem } from "lucide-react";
import { useEffect, useState } from "react";

export interface PrintableLine {
  description: string;
  qty?: number;
  unitPrice?: number;
  total: number;
}

export interface PrintableField {
  label: string;
  value: string;
}

export interface PrintableDocumentProps {
  documentType: string;
  documentId: string;
  date: string;
  statusLabel?: string;
  counterpartyLabel: string;
  counterpartyName: string;
  counterpartyAddress?: string;
  fields?: PrintableField[];
  lines: PrintableLine[];
  currency: string;
  subtotal: number;
  taxLabel?: string;
  tax?: number;
  total: number;
  notes?: string;
}

/**
 * Rendered by every document detail page but only made visible under `@media print` (see the
 * `hidden print:block` / `print:hidden` split between this and the screen UI) — this is what
 * actually prints and what the browser's "Save as PDF" destination captures for Download.
 */
export function PrintableDocument(props: PrintableDocumentProps) {
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const { branding, companyName } = useBranding();

  useEffect(() => {
    getBusinessProfile().then(setBusiness);
  }, []);

  return (
    <div className="hidden print:block p-10 text-sm text-black bg-white">
      <div className="flex items-start justify-between border-b pb-4 mb-6" style={{ borderColor: branding.primaryColor }}>
        <div>
          {branding.primaryLogo ? (
            <img src={branding.primaryLogo} alt={companyName ?? "Company"} className="h-10 w-auto object-contain mb-1" />
          ) : (
            <p className="text-lg font-semibold">{companyName ?? business?.companyName ?? "—"}</p>
          )}
          {business && (
            <p className="text-xs text-black/60 mt-1">
              {business.address}, {business.city}, {business.state} {business.zipCode}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold uppercase tracking-wide" style={{ color: branding.primaryColor }}>
            {props.documentType}
          </p>
          <p className="text-sm mt-1">{props.documentId}</p>
          <p className="text-xs text-black/60">{props.date}</p>
          {props.statusLabel && <p className="text-xs text-black/60 mt-0.5">{props.statusLabel}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-black/60">{props.counterpartyLabel}</p>
          <p className="font-medium mt-1">{props.counterpartyName}</p>
          {props.counterpartyAddress && <p className="text-xs text-black/60">{props.counterpartyAddress}</p>}
        </div>
        {props.fields && props.fields.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs content-start">
            {props.fields.map((f) => (
              <div key={f.label}>
                <span className="text-black/60">{f.label}: </span>
                <span>{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-xs border-t border-b border-black/20 mb-4">
        <thead>
          <tr className="border-b border-black/20">
            <th className="text-left py-1.5 font-medium">Description</th>
            <th className="text-right py-1.5 font-medium">Qty</th>
            <th className="text-right py-1.5 font-medium">Unit price</th>
            <th className="text-right py-1.5 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {props.lines.map((line, index) => (
            <tr key={index} className="border-b border-black/10 last:border-0">
              <td className="py-1.5">{line.description}</td>
              <td className="text-right py-1.5">{line.qty ?? ""}</td>
              <td className="text-right py-1.5">{line.unitPrice !== undefined ? formatCurrency(line.unitPrice, props.currency) : ""}</td>
              <td className="text-right py-1.5">{formatCurrency(line.total, props.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-56 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-black/60">Subtotal</span>
            <span>{formatCurrency(props.subtotal, props.currency)}</span>
          </div>
          {props.tax !== undefined && props.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-black/60">{props.taxLabel ?? "Tax"}</span>
              <span>{formatCurrency(props.tax, props.currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-sm border-t border-black/20 pt-1 mt-1">
            <span>Total</span>
            <span>{formatCurrency(props.total, props.currency)}</span>
          </div>
        </div>
      </div>

      {props.notes && (
        <div className="mt-8 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-black/60 mb-1">Notes</p>
          <p>{props.notes}</p>
        </div>
      )}

      <div className="mt-10 pt-3 border-t border-black/10 flex items-center justify-center gap-1.5 text-[10px] text-black/40">
        <Gem className="h-3 w-3" />
        <span>Powered by OctaGem</span>
      </div>
    </div>
  );
}
