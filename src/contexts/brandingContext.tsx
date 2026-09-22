import { applyBranding, BRANDING_DEFAULTS, clearBranding, loadBranding, saveBranding } from "@/lib/branding";
import { IBrandingConfig } from "@/types/branding";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface BrandingContextValue {
  branding: IBrandingConfig;
  hasCustomBranding: boolean;
  companyName: string | null;
  persistBranding: (config: IBrandingConfig) => IBrandingConfig;
  resetBranding: () => IBrandingConfig;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const [branding, setBranding] = useState<IBrandingConfig>(() => loadBranding());
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("octagem.business.local");
      if (raw) setCompanyName((JSON.parse(raw)?.companyName as string) || null);
    } catch {
      // ignore malformed local business data
    }
  }, []);

  useEffect(() => {
    applyBranding(branding, companyName);
  }, [branding, companyName]);

  const persistBranding = useCallback((config: IBrandingConfig) => {
    const saved = saveBranding(config);
    setBranding(saved);
    return saved;
  }, []);

  const resetBranding = useCallback(() => {
    const defaults = clearBranding();
    setBranding(defaults);
    return defaults;
  }, []);

  const value = useMemo<BrandingContextValue>(
    () => ({
      branding,
      hasCustomBranding: Boolean(branding.primaryLogo || branding.brandMark || branding.lightLogo || branding.favicon),
      companyName,
      persistBranding,
      resetBranding,
    }),
    [branding, companyName, persistBranding, resetBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};

export const useBranding = (): BrandingContextValue => {
  const context = useContext(BrandingContext);
  if (!context) {
    return {
      branding: { ...BRANDING_DEFAULTS },
      hasCustomBranding: false,
      companyName: null,
      persistBranding: (config) => config,
      resetBranding: () => ({ ...BRANDING_DEFAULTS }),
    };
  }
  return context;
};
