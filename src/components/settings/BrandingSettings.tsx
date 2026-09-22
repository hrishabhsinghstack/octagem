import { useBranding } from "@/contexts/brandingContext";
import {
  BRAND_ASSET_SPECS,
  BRANDING_DEFAULTS,
  BrandingStorageError,
  isValidHexColor,
  normalizeHexColor,
  processBrandAssetFile,
} from "@/lib/branding";
import { showError, showSuccess } from "@/lib/utils";
import { BrandAssetKey, IBrandAssetSpec, IBrandingConfig } from "@/types/branding";
import { Bell, Check, ImageIcon, Info, Menu, RotateCcw, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BrandAssetCardProps {
  spec: IBrandAssetSpec;
  value: string | null;
  isSquare: boolean;
  isDark?: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

function BrandAssetCard({ spec, value, isSquare, isDark, onSelect, onRemove }: BrandAssetCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onSelect(file);
  };

  return (
    <div className="border rounded-lg p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold">{spec.title}</h4>
        <Badge variant={spec.required ? "outline" : "secondary"} className="shrink-0 text-[11px]">
          {spec.required ? "Required" : "Optional"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground mt-1">{spec.description}</p>

      <div className="mt-4 flex-1 flex flex-col items-center justify-center">
        <div
          className={`relative w-full flex items-center justify-center border rounded-md overflow-hidden ${isSquare ? "h-28" : "h-24"} ${
            isDark ? "bg-slate-800" : "bg-background"
          }`}
        >
          {value ? (
            <>
              <img src={value} alt={spec.title} className={`object-contain ${isSquare ? "h-20 w-20" : "max-h-16 max-w-[85%]"}`} />
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${spec.title}`}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageIcon className="w-6 h-6" />
              <span className="text-xs">No image</span>
            </div>
          )}
        </div>

        <input ref={inputRef} type="file" accept={spec.accept.join(",")} onChange={handleChange} className="hidden" />

        <Button type="button" variant="link" size="sm" className="mt-2 h-auto p-0" onClick={() => inputRef.current?.click()}>
          <Upload className="w-3 h-3 mr-1" />
          {value ? "Change" : "Upload"}
        </Button>
      </div>

      <div className="mt-3 space-y-0.5">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          {spec.formatHint}
        </p>
        <p className="text-xs text-muted-foreground pl-4">{spec.sizeHint}</p>
      </div>
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

export function BrandingSettings() {
  const { branding, companyName, persistBranding, resetBranding } = useBranding();

  const [draft, setDraft] = useState<IBrandingConfig>(branding);
  const [isSaving, setIsSaving] = useState(false);

  const displayName = companyName || "Your Company";
  const horizontalLogo = draft.primaryLogo;
  const squareMark = draft.brandMark || draft.primaryLogo;
  const darkSurfaceLogo = draft.lightLogo || draft.primaryLogo;

  const handleAssetSelect = async (key: BrandAssetKey, spec: IBrandAssetSpec, file: File) => {
    try {
      const dataUrl = await processBrandAssetFile(file, spec);
      setDraft((previous) => ({ ...previous, [key]: dataUrl }));
    } catch (error: any) {
      showError("Upload Failed", error?.message || "That image could not be processed.");
    }
  };

  const handleColorChange = (key: "primaryColor" | "secondaryColor", value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = () => {
    if (!isValidHexColor(draft.primaryColor)) {
      showError("Invalid Colour", "Primary colour must be a hex value such as #18181b.");
      return;
    }
    if (!isValidHexColor(draft.secondaryColor)) {
      showError("Invalid Colour", "Secondary colour must be a hex value such as #f4f4f5.");
      return;
    }

    setIsSaving(true);
    try {
      const saved = persistBranding({
        ...draft,
        primaryColor: normalizeHexColor(draft.primaryColor)!,
        secondaryColor: normalizeHexColor(draft.secondaryColor)!,
      });
      setDraft(saved);
      showSuccess("Success", "Branding updated successfully");
    } catch (error: any) {
      const message = error instanceof BrandingStorageError ? error.message : error?.message || "Failed to save branding.";
      showError("Error", message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = resetBranding();
    setDraft(defaults);
    showSuccess("Success", "Branding reset to default");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Branding &amp; Logo</h2>
        <p className="text-muted-foreground">Upload your logos and set brand preferences. These are used across the application (white-labeling).</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Brand Assets</CardTitle>
              <p className="text-sm text-muted-foreground">Add your logos in different formats. SVG gives the best quality and the smallest size.</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {BRAND_ASSET_SPECS.map((spec) => (
                <BrandAssetCard
                  key={spec.key}
                  spec={spec}
                  value={draft[spec.key]}
                  isSquare={spec.key === "brandMark" || spec.key === "favicon"}
                  isDark={spec.key === "lightLogo"}
                  onSelect={(file) => handleAssetSelect(spec.key, spec, file)}
                  onRemove={() => setDraft((previous) => ({ ...previous, [spec.key]: null }))}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
              <p className="text-sm text-muted-foreground">The primary colour is used for buttons, links and highlights across the app.</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Primary colour picker"
                    value={normalizeHexColor(draft.primaryColor) || BRANDING_DEFAULTS.primaryColor}
                    onChange={(event) => handleColorChange("primaryColor", event.target.value)}
                    className="h-9 w-12 rounded border cursor-pointer bg-transparent p-1"
                  />
                  <Input id="primaryColor" value={draft.primaryColor} onChange={(event) => handleColorChange("primaryColor", event.target.value)} placeholder="#18181b" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryColor">
                  Secondary Color <span className="text-muted-foreground">(Optional)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Secondary colour picker"
                    value={normalizeHexColor(draft.secondaryColor) || BRANDING_DEFAULTS.secondaryColor}
                    onChange={(event) => handleColorChange("secondaryColor", event.target.value)}
                    className="h-9 w-12 rounded border cursor-pointer bg-transparent p-1"
                  />
                  <Input id="secondaryColor" value={draft.secondaryColor} onChange={(event) => handleColorChange("secondaryColor", event.target.value)} placeholder="#f4f4f5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <p className="text-sm text-muted-foreground">How your brand will appear once you save.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <PreviewSection title="Sidebar Header">
              <div className="border rounded-lg px-3 py-2 flex items-center justify-between bg-background">
                <div className="flex items-center gap-2 min-w-0">
                  <Menu className="w-4 h-4 text-muted-foreground shrink-0" />
                  {horizontalLogo ? (
                    <img src={horizontalLogo} alt={displayName} className="h-6 w-auto object-contain" />
                  ) : (
                    <span className="text-sm font-semibold truncate">{displayName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <div className="w-6 h-6 rounded-full bg-accent" />
                </div>
              </div>
            </PreviewSection>

            <PreviewSection title="Sidebar (Collapsed)">
              <div className="border rounded-lg p-3">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden bg-muted border">
                  {squareMark ? (
                    <img src={squareMark} alt={displayName} className="w-8 h-8 object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-foreground">{displayName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
              </div>
            </PreviewSection>

            <PreviewSection title="Dark Surface">
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-center p-4 bg-slate-800">
                  {darkSurfaceLogo ? (
                    <img src={darkSurfaceLogo} alt={displayName} className="max-h-12 max-w-full object-contain" />
                  ) : (
                    <span className="text-sm font-semibold text-white text-center">{displayName}</span>
                  )}
                </div>
              </div>
            </PreviewSection>

            <PreviewSection title="Primary Button">
              <div
                className="h-9 rounded-md flex items-center justify-center text-sm font-medium"
                style={{ backgroundColor: draft.primaryColor, color: "#fff" }}
              >
                Save Changes
              </div>
            </PreviewSection>

            <div className="flex gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Branding applies to this browser only, since there is no backend yet. This is the first field OctaGem will sync once the tenant API exists.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isSaving}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
