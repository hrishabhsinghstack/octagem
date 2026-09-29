import { useBranding } from "@/contexts/brandingContext";
import { getBusinessProfile } from "@/lib/api/settingsApi";
import type { TemplateOptions } from "@/types/documentTemplate";
import type { BusinessProfile } from "@/types/settings";
import { Gem } from "lucide-react";
import { useEffect, useState } from "react";

export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentShellProps {
  documentType: string;
  documentId: string;
  date: string;
  statusLabel?: string;
  counterpartyLabel: string;
  counterpartyName: string;
  counterpartyAddress?: string;
  fields?: DocumentField[];
  options: TemplateOptions;
  /** The body: line table, totals and text blocks. */
  children: React.ReactNode;
}

/**
 * The fixed frame around every printed document — letterhead, counterparty, meta fields, footer.
 *
 * Deliberately carries no visibility class. `hidden print:block` lives on PrintableDocument's own
 * wrapper instead, because a component that renders nothing on screen by definition cannot be used for
 * the Settings live preview — and a preview that isn't the real thing would drift from the print.
 */
export function DocumentShell(props: DocumentShellProps) {
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const { branding, companyName } = useBranding();
  const accent = props.options.accentColor ?? branding.primaryColor;

  useEffect(() => {
    getBusinessProfile().then(setBusiness);
  }, []);

  return (
    <div className="p-10 text-sm text-black bg-white">
      <div className="flex items-start justify-between border-b pb-4 mb-6" style={{ borderColor: accent }}>
        <div>
          {props.options.showLogo && branding.primaryLogo ? (
            <img src={branding.primaryLogo} alt={companyName ?? "Company"} className="h-10 w-auto object-contain mb-1" />
          ) : (
            <p className="text-lg font-semibold">{companyName ?? business?.companyName ?? "—"}</p>
          )}
          {props.options.showBusinessAddress && business && (
            <p className="text-xs text-black/60 mt-1">
              {business.address}, {business.city}, {business.state} {business.zipCode}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold uppercase tracking-wide" style={{ color: accent }}>
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
            {props.fields.map((field) => (
              <div key={field.label}>
                <span className="text-black/60">{field.label}: </span>
                <span>{field.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {props.children}

      {props.options.showPoweredBy && (
        <div className="mt-10 pt-3 border-t border-black/10 flex items-center justify-center gap-1.5 text-[10px] text-black/40">
          <Gem className="h-3 w-3" />
          <span>Powered by OctaGem</span>
        </div>
      )}
    </div>
  );
}
