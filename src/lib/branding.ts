import { IBrandAssetSpec, IBrandingConfig } from "@/types/branding";

/**
 * Branding is stored client-side in localStorage. There is no backend yet (see
 * OCTAGEM-BLUEPRINT.md §38), so this is single-tenant for now, keyed by a fixed local id.
 * Once real auth/tenancy exists, replace LOCAL_TENANT_ID with the signed-in business id and
 * this module's load/save calls with API calls — everything else (the CSS-variable application,
 * the hex/HSL math) carries over unchanged.
 */
const STORAGE_PREFIX = "octagem.branding";
const LOCAL_TENANT_ID = "local";

const MAX_TOTAL_BRANDING_CHARS = 3_000_000;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_SVG_BYTES = 256 * 1024;
const MAX_ENCODED_CHARS = 400_000;

const DEFAULT_PRIMARY_COLOR = "#18181b";
const DEFAULT_SECONDARY_COLOR = "#f4f4f5";

/** Matches --foreground in index.css. */
const DARK_FOREGROUND_TRIPLET = "240 10% 3.9%";
const LIGHT_FOREGROUND_TRIPLET = "0 0% 98%";

export const BRANDING_DEFAULTS: IBrandingConfig = {
  primaryLogo: "/octagem.png",
  brandMark: "/octagemmark.png",
  lightLogo: "/octagem.png",
  favicon: "/octagemmark.png",
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
  updatedAt: null,
};

const IMAGE_ACCEPT = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"];

export const BRAND_ASSET_SPECS: IBrandAssetSpec[] = [
  {
    key: "primaryLogo",
    title: "Primary Logo (Horizontal)",
    description: "Used in the sidebar header when expanded.",
    required: false,
    maxWidth: 640,
    maxHeight: 160,
    accept: IMAGE_ACCEPT,
    formatHint: "SVG or PNG (Recommended)",
    sizeHint: "Max size 2MB",
  },
  {
    key: "brandMark",
    title: "Brand Mark (Square)",
    description: "Used in compact spaces such as the collapsed sidebar.",
    required: false,
    maxWidth: 256,
    maxHeight: 256,
    accept: IMAGE_ACCEPT,
    formatHint: "SVG or PNG (Recommended)",
    sizeHint: "Max size 2MB",
  },
  {
    key: "lightLogo",
    title: "Light Logo",
    description: "Used on dark backgrounds or coloured surfaces.",
    required: false,
    maxWidth: 640,
    maxHeight: 160,
    accept: IMAGE_ACCEPT,
    formatHint: "SVG or PNG",
    sizeHint: "Max size 2MB",
  },
  {
    key: "favicon",
    title: "Favicon / App Icon",
    description: "Displayed in the browser tab and bookmarks.",
    required: false,
    maxWidth: 128,
    maxHeight: 128,
    accept: IMAGE_ACCEPT,
    formatHint: "PNG (Recommended)",
    sizeHint: "512x512px or higher",
  },
];

/* ------------------------------------------------------------------ colours */

export function normalizeHexColor(value: string): string | null {
  if (!value) return null;
  const raw = value.trim().replace(/^#/, "");
  const expanded = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return `#${expanded.toLowerCase()}`;
}

export function isValidHexColor(value: string): boolean {
  return normalizeHexColor(value) !== null;
}

/** Converts hex to the `H S% L%` triplet shape the Tailwind tokens expect. */
export function hexToHslTriplet(value: string): string | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;

  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function channelLuminance(channel: number): number {
  const ratio = channel / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
}

/** Picks white or near-black text for a given background colour. */
export function getReadableForegroundTriplet(value: string): string {
  const normalized = normalizeHexColor(value);
  if (!normalized) return LIGHT_FOREGROUND_TRIPLET;

  const luminance =
    0.2126 * channelLuminance(parseInt(normalized.slice(1, 3), 16)) +
    0.7152 * channelLuminance(parseInt(normalized.slice(3, 5), 16)) +
    0.0722 * channelLuminance(parseInt(normalized.slice(5, 7), 16));

  return luminance > 0.4 ? DARK_FOREGROUND_TRIPLET : LIGHT_FOREGROUND_TRIPLET;
}

/* ----------------------------------------------------------------- storage */

function getStorageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}.${tenantId}`;
}

function parseBranding(raw: string | null): IBrandingConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<IBrandingConfig>;
    return {
      ...BRANDING_DEFAULTS,
      ...parsed,
      primaryColor: normalizeHexColor(parsed?.primaryColor ?? "") || BRANDING_DEFAULTS.primaryColor,
      secondaryColor: normalizeHexColor(parsed?.secondaryColor ?? "") || BRANDING_DEFAULTS.secondaryColor,
    };
  } catch (error) {
    console.error("Invalid branding config in storage", error);
    return null;
  }
}

export function loadBranding(tenantId: string = LOCAL_TENANT_ID): IBrandingConfig {
  try {
    return parseBranding(localStorage.getItem(getStorageKey(tenantId))) || { ...BRANDING_DEFAULTS };
  } catch (error) {
    console.error("Unable to read branding config", error);
    return { ...BRANDING_DEFAULTS };
  }
}

export class BrandingStorageError extends Error {}

export function saveBranding(config: IBrandingConfig, tenantId: string = LOCAL_TENANT_ID): IBrandingConfig {
  const payload: IBrandingConfig = { ...config, updatedAt: new Date().toISOString() };
  const serialized = JSON.stringify(payload);

  if (serialized.length > MAX_TOTAL_BRANDING_CHARS) {
    throw new BrandingStorageError("Branding assets are too large to store. Upload smaller files, ideally SVG.");
  }

  try {
    localStorage.setItem(getStorageKey(tenantId), serialized);
  } catch {
    throw new BrandingStorageError("Browser storage is full, so branding could not be saved. Try smaller logo files.");
  }

  return payload;
}

export function clearBranding(tenantId: string = LOCAL_TENANT_ID): IBrandingConfig {
  try {
    localStorage.removeItem(getStorageKey(tenantId));
  } catch (error) {
    console.error("Unable to clear branding config", error);
  }
  return { ...BRANDING_DEFAULTS };
}

/* ------------------------------------------------------- applying to the DOM */

function setCssVariable(name: string, value: string | null) {
  const root = document.documentElement;
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

function applyFavicon(href: string | null) {
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Pushes branding into CSS custom properties and the favicon. Only tokens that already
 * exist in index.css are overridden, so anything using `bg-primary` / `text-primary`
 * recolours automatically.
 */
export function applyBranding(config: IBrandingConfig, companyName?: string | null) {
  const primaryTriplet = hexToHslTriplet(config.primaryColor);
  const secondaryTriplet = hexToHslTriplet(config.secondaryColor);

  if (primaryTriplet) {
    const primaryForeground = getReadableForegroundTriplet(config.primaryColor);
    setCssVariable("--primary", primaryTriplet);
    setCssVariable("--primary-foreground", primaryForeground);
    setCssVariable("--ring", primaryTriplet);
    setCssVariable("--sidebar-primary", primaryTriplet);
    setCssVariable("--sidebar-primary-foreground", primaryForeground);
    setCssVariable("--sidebar-ring", primaryTriplet);
  }

  if (secondaryTriplet) {
    setCssVariable("--secondary", secondaryTriplet);
    setCssVariable("--secondary-foreground", getReadableForegroundTriplet(config.secondaryColor));
  }

  applyFavicon(config.favicon);
  document.title = companyName ? `${companyName} | OctaGem` : "OctaGem";
}

/* ------------------------------------------------------------ file handling */

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file could not be read as an image."));
    image.src = source;
  });
}

async function downscaleRasterImage(dataUrl: string, spec: IBrandAssetSpec): Promise<string> {
  const image = await loadImageElement(dataUrl);
  const scale = Math.min(spec.maxWidth / image.width, spec.maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);

  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_ENCODED_CHARS) return png;
  const webp = canvas.toDataURL("image/webp", 0.9);
  return webp.length < png.length ? webp : png;
}

export async function processBrandAssetFile(file: File, spec: IBrandAssetSpec): Promise<string> {
  if (!spec.accept.includes(file.type)) {
    throw new Error(`${file.name} is not a supported image. Use SVG, PNG, JPEG or WebP.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than 2MB.`);
  }
  if (file.type === "image/svg+xml") {
    if (file.size > MAX_SVG_BYTES) {
      throw new Error(`${file.name} is too large for an SVG. Keep it under 256KB.`);
    }
    return readFileAsDataUrl(file);
  }
  const dataUrl = await readFileAsDataUrl(file);
  return downscaleRasterImage(dataUrl, spec);
}
