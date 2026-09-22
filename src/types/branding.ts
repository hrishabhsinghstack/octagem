export type BrandAssetKey = "primaryLogo" | "brandMark" | "lightLogo" | "favicon";

/** Tenant branding. Asset fields hold data URLs, persisted client-side (see src/lib/branding.ts). */
export interface IBrandingConfig {
  primaryLogo: string | null;
  brandMark: string | null;
  lightLogo: string | null;
  favicon: string | null;
  primaryColor: string;
  secondaryColor: string;
  updatedAt: string | null;
}

export interface IBrandAssetSpec {
  key: BrandAssetKey;
  title: string;
  description: string;
  required: boolean;
  maxWidth: number;
  maxHeight: number;
  accept: string[];
  formatHint: string;
  sizeHint: string;
}
