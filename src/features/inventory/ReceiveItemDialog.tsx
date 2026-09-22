import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listCustomFieldDefinitions } from "@/lib/api/customFieldApi";
import { receiveItem, updateItemDetails } from "@/lib/api/inventoryApi";
import { getList, listLocationPaths } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { CustomFieldDefinition, CustomFieldValue } from "@/types/customField";
import type { DiamondAttributes, IdentityModel, InventoryCategory, InventoryItem, JewelryAttributes, JewelryComponent, WatchAttributes } from "@/types/inventory";
import type { MasterListEntry } from "@/types/masterData";
import { Check, Diamond as DiamondIcon, Gem, Plus, Trash2, Watch as WatchIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface ReceiveItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item?: InventoryItem) => void;
  /** When set, the dialog edits this item instead of creating a new one. */
  editItem?: InventoryItem | null;
  /** Pre-fills a fresh receive (e.g. from a Purchase Order or Memo In line) — ignored when editItem is set. When memoInId is set, this is a consignment receive: no cost layer, a consignment value + price basis are captured instead. */
  prefill?: { vendorId?: string; purchaseOrderId?: string; memoInId?: string; category?: InventoryCategory; cost?: number; priceBasis?: string };
}

const STEPS = ["Identity & Source", "Specification", "Pricing & Receive"] as const;
type Step = 0 | 1 | 2;

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

const emptyComponent = (): JewelryComponent => ({ id: crypto.randomUUID(), type: "Diamond", shape: "", color: "", clarity: "", quantity: 1, weightCarats: undefined, isCenter: false });

function MasterSelect({
  label,
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

const CATEGORY_META: Record<InventoryCategory, { icon: typeof DiamondIcon; placeholder: string }> = {
  Diamond: { icon: DiamondIcon, placeholder: "D-1200" },
  Jewelry: { icon: Gem, placeholder: "J-3100" },
  Watch: { icon: WatchIcon, placeholder: "W-4000" },
};

export function ReceiveItemDialog({ open, onOpenChange, onSaved, editItem, prefill }: ReceiveItemDialogProps) {
  const isEditing = Boolean(editItem);
  const [step, setStep] = useState<Step>(0);
  const [category, setCategory] = useState<InventoryCategory>("Diamond");
  const [identityModel, setIdentityModel] = useState<IdentityModel>("UNIQUE");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [consignmentValue, setConsignmentValue] = useState("");
  const [consignmentPriceBasis, setConsignmentPriceBasis] = useState("");
  const [saving, setSaving] = useState(false);

  const isConsignment = Boolean(prefill?.memoInId);

  const [diamond, setDiamond] = useState<Partial<DiamondAttributes>>({ shape: "Round", color: "", clarity: "", lab: "GIA", certificateNumber: "", isLabGrown: false });
  const [jewelry, setJewelry] = useState<Partial<JewelryAttributes>>({ styleNumber: "", metalType: "Gold", grossWeightGrams: 0 });
  const [components, setComponents] = useState<JewelryComponent[]>([]);
  const [watch, setWatch] = useState<Partial<WatchAttributes>>({ brand: "", referenceNumber: "", serialNumber: "", hasBox: false, hasPapers: false, conditionGrade: "Excellent" });

  const [diamondShapes, setDiamondShapes] = useState<string[]>([]);
  const [labs, setLabs] = useState<string[]>([]);
  const [treatments, setTreatments] = useState<string[]>([]);
  const [fancyColorIntensities, setFancyColorIntensities] = useState<string[]>([]);
  const [metalTypes, setMetalTypes] = useState<string[]>([]);
  const [metalKarats, setMetalKarats] = useState<MasterListEntry[]>([]);
  const [metalColors, setMetalColors] = useState<string[]>([]);
  const [jewelryGroups, setJewelryGroups] = useState<string[]>([]);
  const [jewelrySubCategories, setJewelrySubCategories] = useState<string[]>([]);
  const [settingTypes, setSettingTypes] = useState<string[]>([]);
  const [gemstoneTypes, setGemstoneTypes] = useState<string[]>([]);
  const [watchBrands, setWatchBrands] = useState<string[]>([]);
  const [watchMovements, setWatchMovements] = useState<string[]>([]);
  const [watchCaseMaterials, setWatchCaseMaterials] = useState<string[]>([]);
  const [watchFeatureOptions, setWatchFeatureOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, CustomFieldValue>>({});

  const applicableCustomFields = customFieldDefinitions.filter((d) => d.active && (d.appliesTo === "All" || d.appliesTo === category));

  useEffect(() => {
    if (!open) return;
    listCustomFieldDefinitions().then(setCustomFieldDefinitions);
    setDiamondShapes(getList("diamondShapes").map((e) => e.label));
    setLabs(getList("certificationLabs").map((e) => e.label));
    setTreatments(getList("diamondTreatments").map((e) => e.label));
    setFancyColorIntensities(getList("fancyColorIntensities").map((e) => e.label));
    setMetalTypes(getList("metalTypes").map((e) => e.label));
    setMetalKarats(getList("metalKarats"));
    setMetalColors(getList("metalColors").map((e) => e.label));
    setJewelryGroups(getList("jewelryGroups").map((e) => e.label));
    setJewelrySubCategories(getList("jewelrySubCategories").map((e) => e.label));
    setSettingTypes(getList("settingTypes").map((e) => e.label));
    setGemstoneTypes(getList("gemstoneTypes").map((e) => e.label));
    setWatchBrands(getList("watchBrands").map((e) => e.label));
    setWatchMovements(getList("watchMovements").map((e) => e.label));
    setWatchCaseMaterials(getList("watchCaseMaterials").map((e) => e.label));
    setWatchFeatureOptions(getList("watchFeatures").map((e) => e.label));
    const paths = listLocationPaths().map((l) => l.path);
    setLocationOptions(paths);

    if (editItem) {
      setCategory(editItem.category);
      setIdentityModel(editItem.identityModel);
      setCode(editItem.code);
      setTitle(editItem.title);
      setDescription(editItem.description);
      setLocation(editItem.location);
      setCost(String(editItem.cost));
      setAskingPrice(String(editItem.askingPrice));
      if (editItem.diamond) setDiamond(editItem.diamond);
      if (editItem.jewelry) {
        setJewelry(editItem.jewelry);
        setComponents(editItem.jewelry.components);
      }
      if (editItem.watch) setWatch(editItem.watch);
      setCustomFieldValues(editItem.customFields ?? {});
    } else {
      const receiving = paths.find((p) => p.toLowerCase().includes("receiving")) ?? paths[0];
      setLocation((current) => current || receiving || "");
      if (prefill?.category) {
        setCategory(prefill.category);
        setIdentityModel(prefill.category === "Jewelry" ? "QUANTITY" : "UNIQUE");
      }
      if (prefill?.cost !== undefined) setCost((current) => current || String(prefill.cost));
      if (prefill?.priceBasis) setConsignmentPriceBasis((current) => current || prefill.priceBasis!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem, prefill]);

  const availableKarats = metalKarats.filter((k) => k.scopeValue === jewelry.metalType).map((k) => k.label);

  const reset = () => {
    setStep(0);
    setCategory("Diamond");
    setIdentityModel("UNIQUE");
    setCode("");
    setTitle("");
    setDescription("");
    setLocation("");
    setCost("");
    setAskingPrice("");
    setConsignmentValue("");
    setConsignmentPriceBasis("");
    setDiamond({ shape: "Round", color: "", clarity: "", lab: "GIA", certificateNumber: "", isLabGrown: false });
    setJewelry({ styleNumber: "", metalType: "Gold", grossWeightGrams: 0 });
    setComponents([]);
    setWatch({ brand: "", referenceNumber: "", serialNumber: "", hasBox: false, hasPapers: false, conditionGrade: "Excellent" });
    setCustomFieldValues({});
  };

  const chooseCategory = (value: InventoryCategory) => {
    setCategory(value);
    setIdentityModel(value === "Jewelry" ? "QUANTITY" : "UNIQUE");
  };

  const addComponent = () => setComponents((rows) => [...rows, emptyComponent()]);
  const removeComponent = (id: string) => setComponents((rows) => rows.filter((row) => row.id !== id));
  const updateComponent = (id: string, patch: Partial<JewelryComponent>) => setComponents((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const step1Valid = code.trim().length > 0 && title.trim().length > 0;
  const step3Valid = (isConsignment ? consignmentValue !== "" : cost !== "") && askingPrice !== "";
  const effectiveCost = isConsignment ? consignmentValue : cost;
  const margin = effectiveCost && askingPrice ? Math.round(((Number(askingPrice) - Number(effectiveCost)) / Number(askingPrice)) * 100) : null;

  const goNext = () => {
    if (step === 0 && !step1Valid) {
      showError("Missing fields", "Stock number and item name are required.");
      return;
    }
    setStep((s) => (s < 2 ? ((s + 1) as Step) : s));
  };

  const handleSubmit = async () => {
    if (!step3Valid) {
      showError("Missing fields", "Cost and asking price are required.");
      return;
    }
    setSaving(true);
    try {
      const attributePayload = {
        diamond: category === "Diamond" ? (diamond as DiamondAttributes) : undefined,
        jewelry: category === "Jewelry" ? ({ ...jewelry, components } as JewelryAttributes) : undefined,
        watch: category === "Watch" ? (watch as WatchAttributes) : undefined,
      };

      let savedItem: InventoryItem | undefined;
      if (isEditing && editItem) {
        savedItem = await updateItemDetails(editItem.id, {
          title: title.trim(),
          description: description.trim() || `${category} · received today`,
          location,
          cost: Number(cost),
          askingPrice: Number(askingPrice),
          customFields: customFieldValues,
          ...attributePayload,
        });
        showSuccess("Saved", `${editItem.code} updated.`);
      } else {
        savedItem = await receiveItem({
          category,
          identityModel,
          code: code.trim().toUpperCase(),
          title: title.trim(),
          description: description.trim() || `${category} · received today`,
          location,
          cost: isConsignment ? 0 : Number(cost),
          askingPrice: Number(askingPrice),
          vendorId: prefill?.vendorId,
          purchaseOrderId: prefill?.purchaseOrderId,
          ownership: isConsignment ? "CONSIGNED_IN" : "OWNED",
          memoInId: prefill?.memoInId,
          consignmentValue: isConsignment ? Number(consignmentValue) : undefined,
          consignmentPriceBasis: isConsignment ? consignmentPriceBasis.trim() : undefined,
          customFields: customFieldValues,
          ...attributePayload,
        });
        showSuccess(isConsignment ? "Received on consignment" : "Received", `${code.trim().toUpperCase()} added to inventory.`);
      }
      reset();
      onOpenChange(false);
      onSaved(savedItem);
    } catch (error: any) {
      showError("Error", error?.message || "Could not save this item.");
    } finally {
      setSaving(false);
    }
  };

  const CategoryIcon = CATEGORY_META[category].icon;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent size="formLg" className="p-0 gap-0 h-full flex flex-col overflow-hidden">
        {/* Header + stepper */}
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">{isEditing ? `Edit ${editItem?.code}` : isConsignment ? "Receive on consignment" : "Receive inventory"}</h2>
          <div className="flex items-center gap-2 mt-3">
            {STEPS.map((label, index) => {
              const isDone = index < step;
              const isCurrent = index === step;
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      isDone && "bg-primary text-primary-foreground",
                      isCurrent && "border-2 border-primary text-primary",
                      !isDone && !isCurrent && "border text-muted-foreground"
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <span className={cn("text-xs whitespace-nowrap", isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
                  {index < STEPS.length - 1 && <div className={cn("h-px flex-1", isDone ? "bg-primary" : "bg-border")} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body: main step content + live summary rail */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Category</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(CATEGORY_META) as InventoryCategory[]).map((option) => {
                      const Icon = CATEGORY_META[option].icon;
                      const selected = category === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={isEditing}
                          onClick={() => chooseCategory(option)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-colors",
                            selected ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50 text-muted-foreground",
                            isEditing && !selected && "opacity-40 cursor-not-allowed"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-medium">{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Stock number" required>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={CATEGORY_META[category].placeholder} disabled={isEditing} />
                  </Field>
                  <Field label="Identity model">
                    <Select value={identityModel} onValueChange={(v) => setIdentityModel(v as IdentityModel)} disabled={category === "Watch" || isEditing}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNIQUE">Unique</SelectItem>
                        <SelectItem value="LOT">Lot / parcel</SelectItem>
                        <SelectItem value="QUANTITY">Quantity</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Item name" required>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short display name" />
                </Field>

                <Field label="Description">
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Customer-facing description" />
                </Field>

                <MasterSelect label="Location" value={location} onChange={setLocation} options={locationOptions} placeholder="Select a location" />
              </div>
            )}

            {step === 1 && category === "Diamond" && (
              <div className="grid grid-cols-3 gap-4">
                <MasterSelect label="Shape" value={diamond.shape ?? ""} onChange={(v) => setDiamond((d) => ({ ...d, shape: v }))} options={diamondShapes} />
                <Field label="Carat">
                  <Input type="number" step="0.01" value={diamond.caratWeight ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, caratWeight: Number(e.target.value) }))} />
                </Field>
                <Field label="Origin">
                  <Select value={diamond.isLabGrown ? "lab" : "natural"} onValueChange={(v) => setDiamond((d) => ({ ...d, isLabGrown: v === "lab" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="natural">Natural</SelectItem>
                      <SelectItem value="lab">Laboratory-grown</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Color">
                  <Input value={diamond.color ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, color: e.target.value }))} placeholder="D–Z" />
                </Field>
                <Field label="Clarity">
                  <Input value={diamond.clarity ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, clarity: e.target.value }))} placeholder="FL–I3" />
                </Field>
                <Field label="Cut">
                  <Input value={diamond.cut ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, cut: e.target.value }))} placeholder="Excellent" />
                </Field>
                <MasterSelect label="Lab" value={diamond.lab ?? ""} onChange={(v) => setDiamond((d) => ({ ...d, lab: v }))} options={labs} />
                <Field label="Certificate #">
                  <Input value={diamond.certificateNumber ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, certificateNumber: e.target.value }))} />
                </Field>
                <MasterSelect label="Treatment" value={diamond.treatment ?? ""} onChange={(v) => setDiamond((d) => ({ ...d, treatment: v }))} options={treatments} />
              </div>
            )}

            {step === 1 && category === "Jewelry" && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Style #">
                    <Input value={jewelry.styleNumber ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, styleNumber: e.target.value }))} />
                  </Field>
                  <MasterSelect label="Group" value={jewelry.group ?? ""} onChange={(v) => setJewelry((j) => ({ ...j, group: v }))} options={jewelryGroups} />
                  <MasterSelect label="Sub-category" value={jewelry.subCategory ?? ""} onChange={(v) => setJewelry((j) => ({ ...j, subCategory: v }))} options={jewelrySubCategories} />
                  <MasterSelect
                    label="Metal"
                    value={jewelry.metalType ?? ""}
                    onChange={(v) => setJewelry((j) => ({ ...j, metalType: v, metalKarat: "" }))}
                    options={metalTypes}
                  />
                  <MasterSelect label="Color" value={jewelry.metalColor ?? ""} onChange={(v) => setJewelry((j) => ({ ...j, metalColor: v }))} options={metalColors} />
                  <MasterSelect label="Karat" value={jewelry.metalKarat ?? ""} onChange={(v) => setJewelry((j) => ({ ...j, metalKarat: v }))} options={availableKarats} placeholder={jewelry.metalType ? "Select…" : "Pick a metal first"} />
                  <Field label="Gross weight (g)">
                    <Input type="number" step="0.1" value={jewelry.grossWeightGrams ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, grossWeightGrams: Number(e.target.value) }))} />
                  </Field>
                  <MasterSelect label="Setting type" value={jewelry.settingType ?? ""} onChange={(v) => setJewelry((j) => ({ ...j, settingType: v }))} options={settingTypes} />
                  <Field label="Hallmark">
                    <Input value={jewelry.hallmark ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, hallmark: e.target.value }))} placeholder="18K750" />
                  </Field>
                  <Field label="Vendor stock #">
                    <Input value={jewelry.vendorStockNumber ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, vendorStockNumber: e.target.value }))} placeholder="Vendor's own reference" />
                  </Field>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Bill of materials</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addComponent} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" /> Add component
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {components.map((c) => (
                      <div key={c.id} className="rounded-md border p-1.5 space-y-1.5">
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_64px_64px_70px_28px] gap-1.5 items-center">
                          <Select value={c.type} onValueChange={(v) => updateComponent(c.id, { type: v })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {gemstoneTypes.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={c.shape ?? ""} onValueChange={(v) => updateComponent(c.id, { shape: v })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Shape" />
                            </SelectTrigger>
                            <SelectContent>
                              {diamondShapes.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input value={c.color ?? ""} onChange={(e) => updateComponent(c.id, { color: e.target.value })} placeholder="Color" className="h-8 text-xs" />
                          <Input value={c.clarity ?? ""} onChange={(e) => updateComponent(c.id, { clarity: e.target.value })} placeholder="Clarity" className="h-8 text-xs" />
                          <Input type="number" value={c.quantity} onChange={(e) => updateComponent(c.id, { quantity: Number(e.target.value) })} placeholder="Qty" className="h-8 text-xs" />
                          <Input
                            type="number"
                            step="0.01"
                            value={c.weightCarats ?? ""}
                            onChange={(e) => updateComponent(c.id, { weightCarats: Number(e.target.value) })}
                            placeholder="Ct"
                            className="h-8 text-xs"
                          />
                          <label className="flex items-center gap-1 text-xs justify-center">
                            <Switch checked={c.isCenter} onCheckedChange={(checked) => updateComponent(c.id, { isCenter: checked })} /> Ctr
                          </label>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeComponent(c.id)} className="h-8 w-8">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-6 gap-1.5 items-center pl-0.5">
                          <Select value={c.fancyColor?.intensity ?? ""} onValueChange={(v) => updateComponent(c.id, { fancyColor: { ...c.fancyColor, intensity: v } })}>
                            <SelectTrigger className="h-7 text-[11px]">
                              <SelectValue placeholder="Fancy intensity" />
                            </SelectTrigger>
                            <SelectContent>
                              {fancyColorIntensities.map((f) => (
                                <SelectItem key={f} value={f}>
                                  {f}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={c.treatment ?? ""} onValueChange={(v) => updateComponent(c.id, { treatment: v })}>
                            <SelectTrigger className="h-7 text-[11px]">
                              <SelectValue placeholder="Treatment" />
                            </SelectTrigger>
                            <SelectContent>
                              {treatments.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input value={c.size ?? ""} onChange={(e) => updateComponent(c.id, { size: e.target.value })} placeholder="Size" className="h-7 text-[11px]" />
                          <Input value={c.stoneNumber ?? ""} onChange={(e) => updateComponent(c.id, { stoneNumber: e.target.value })} placeholder="Stone #" className="h-7 text-[11px]" />
                          <Select value={c.lab ?? ""} onValueChange={(v) => updateComponent(c.id, { lab: v })}>
                            <SelectTrigger className="h-7 text-[11px]">
                              <SelectValue placeholder="Lab" />
                            </SelectTrigger>
                            <SelectContent>
                              {labs.map((l) => (
                                <SelectItem key={l} value={l}>
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input value={c.certificateNumber ?? ""} onChange={(e) => updateComponent(c.id, { certificateNumber: e.target.value })} placeholder="Cert #" className="h-7 text-[11px]" />
                        </div>
                      </div>
                    ))}
                    {components.length === 0 && <p className="text-xs text-muted-foreground">No mounted stones — plain metal piece.</p>}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && category === "Watch" && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <MasterSelect label="Brand" value={watch.brand ?? ""} onChange={(v) => setWatch((w) => ({ ...w, brand: v }))} options={watchBrands} />
                  <Field label="Model">
                    <Input value={watch.model ?? ""} onChange={(e) => setWatch((w) => ({ ...w, model: e.target.value }))} />
                  </Field>
                  <Field label="Reference #">
                    <Input value={watch.referenceNumber ?? ""} onChange={(e) => setWatch((w) => ({ ...w, referenceNumber: e.target.value }))} />
                  </Field>
                  <Field label="Serial #">
                    <Input value={watch.serialNumber ?? ""} onChange={(e) => setWatch((w) => ({ ...w, serialNumber: e.target.value }))} />
                  </Field>
                  <MasterSelect label="Case material" value={watch.caseMaterial ?? ""} onChange={(v) => setWatch((w) => ({ ...w, caseMaterial: v }))} options={watchCaseMaterials} />
                  <MasterSelect label="Movement" value={watch.movement ?? ""} onChange={(v) => setWatch((w) => ({ ...w, movement: v }))} options={watchMovements} />
                  <Field label="Condition">
                    <Select value={watch.conditionGrade} onValueChange={(v) => setWatch((w) => ({ ...w, conditionGrade: v as WatchAttributes["conditionGrade"] }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Unworn">Unworn</SelectItem>
                        <SelectItem value="Excellent">Excellent</SelectItem>
                        <SelectItem value="Very good">Very good</SelectItem>
                        <SelectItem value="Good">Good</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Box / Papers" className="col-span-2">
                    <div className="flex items-center gap-4 h-10">
                      <label className="flex items-center gap-1.5 text-sm">
                        <Switch checked={watch.hasBox} onCheckedChange={(checked) => setWatch((w) => ({ ...w, hasBox: checked }))} /> Box
                      </label>
                      <label className="flex items-center gap-1.5 text-sm">
                        <Switch checked={watch.hasPapers} onCheckedChange={(checked) => setWatch((w) => ({ ...w, hasPapers: checked }))} /> Papers
                      </label>
                    </div>
                  </Field>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Features</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {watchFeatureOptions.map((feature) => {
                      const active = watch.features?.includes(feature) ?? false;
                      return (
                        <button
                          key={feature}
                          type="button"
                          onClick={() =>
                            setWatch((w) => ({
                              ...w,
                              features: active ? (w.features ?? []).filter((f) => f !== feature) : [...(w.features ?? []), feature],
                            }))
                          }
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs border transition-colors",
                            active ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {feature}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && applicableCustomFields.length > 0 && (
              <div className="mt-5">
                <Label className="text-xs text-muted-foreground mb-2 block">Custom fields</Label>
                <div className="grid grid-cols-3 gap-4">
                  {applicableCustomFields.map((d) => (
                    <Field key={d.id} label={d.label} required={d.required}>
                      {d.type === "text" && (
                        <Input value={String(customFieldValues[d.id] ?? "")} onChange={(e) => setCustomFieldValues((v) => ({ ...v, [d.id]: e.target.value }))} />
                      )}
                      {d.type === "number" && (
                        <Input
                          type="number"
                          value={customFieldValues[d.id] !== undefined ? String(customFieldValues[d.id]) : ""}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [d.id]: Number(e.target.value) }))}
                        />
                      )}
                      {d.type === "date" && (
                        <Input
                          type="date"
                          value={String(customFieldValues[d.id] ?? "")}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [d.id]: e.target.value }))}
                        />
                      )}
                      {d.type === "boolean" && (
                        <div className="h-10 flex items-center">
                          <Switch
                            checked={Boolean(customFieldValues[d.id])}
                            onCheckedChange={(checked) => setCustomFieldValues((v) => ({ ...v, [d.id]: checked }))}
                          />
                        </div>
                      )}
                      {d.type === "dropdown" && (
                        <Select value={String(customFieldValues[d.id] ?? "")} onValueChange={(val) => setCustomFieldValues((v) => ({ ...v, [d.id]: val }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(d.options ?? []).map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                {isConsignment ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Consignment value" required>
                      <Input type="number" step="0.01" value={consignmentValue} onChange={(e) => setConsignmentValue(e.target.value)} />
                    </Field>
                    <Field label="Asking price" required>
                      <Input type="number" step="0.01" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
                    </Field>
                    <Field label="Price basis" className="col-span-2">
                      <Input value={consignmentPriceBasis} onChange={(e) => setConsignmentPriceBasis(e.target.value)} placeholder="e.g. $5,800 net if sold" />
                    </Field>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Acquisition cost" required>
                      <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
                    </Field>
                    <Field label="Asking price" required>
                      <Input type="number" step="0.01" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
                    </Field>
                  </div>
                )}

                {category === "Diamond" && (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Rap price / ct">
                      <Input type="number" value={diamond.rapPricePerCarat ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, rapPricePerCarat: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Discount off Rap %">
                      <Input type="number" value={diamond.rapDiscountPct ?? ""} onChange={(e) => setDiamond((d) => ({ ...d, rapDiscountPct: Number(e.target.value) }))} placeholder="-25" />
                    </Field>
                  </div>
                )}

                {category === "Jewelry" && (
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Metal cost">
                      <Input type="number" value={jewelry.metalCost ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, metalCost: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Jewelry expense (making charges)">
                      <Input type="number" value={jewelry.jewelryExpense ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, jewelryExpense: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Mounting sell price">
                      <Input type="number" value={jewelry.mountingSellPrice ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, mountingSellPrice: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Tag price">
                      <Input type="number" value={jewelry.tagPrice ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, tagPrice: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Retail price">
                      <Input type="number" value={jewelry.retailPrice ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, retailPrice: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Markup %">
                      <Input type="number" value={jewelry.markupPct ?? ""} onChange={(e) => setJewelry((j) => ({ ...j, markupPct: Number(e.target.value) }))} />
                    </Field>
                  </div>
                )}

                {category === "Watch" && (
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Base price">
                      <Input type="number" value={watch.basePrice ?? ""} onChange={(e) => setWatch((w) => ({ ...w, basePrice: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Retail price">
                      <Input type="number" value={watch.retailPrice ?? ""} onChange={(e) => setWatch((w) => ({ ...w, retailPrice: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Our price">
                      <Input type="number" value={watch.ourPrice ?? ""} onChange={(e) => setWatch((w) => ({ ...w, ourPrice: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Markup %">
                      <Input type="number" value={watch.markupPct ?? ""} onChange={(e) => setWatch((w) => ({ ...w, markupPct: Number(e.target.value) }))} />
                    </Field>
                  </div>
                )}

                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {isEditing ? (
                    "Saving logs a details-updated movement on this item's ledger — status and custody are unaffected."
                  ) : isConsignment ? (
                    <>
                      The item enters inventory as <span className="font-medium text-foreground">Consigned</span>, cost stays $0 — no cost layer until sold. A vendor bill for the consignment value is created automatically the moment it sells.
                    </>
                  ) : (
                    <>
                      The item enters Receiving with an immutable receipt movement, and status <span className="font-medium text-foreground">Available</span>.
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live summary rail */}
          <div className="w-64 shrink-0 border-l bg-muted/30 p-5 overflow-y-auto hidden sm:block">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-background border shrink-0">
                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{title || "Untitled item"}</p>
                <p className="text-xs text-muted-foreground truncate">{code || "No stock #"}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <Badge variant="outline">{category}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identity</span>
                <span>{identityModel}</span>
              </div>
              {location && (
                <div>
                  <span className="text-muted-foreground block">Location</span>
                  <span className="text-foreground">{location}</span>
                </div>
              )}
            </div>
            {margin !== null && (
              <div className="mt-4 pt-4 border-t space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isConsignment ? "Consignment value" : "Cost"}</span>
                  <span>{formatCurrency(Number(effectiveCost))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asking</span>
                  <span>{formatCurrency(Number(askingPrice))}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Margin</span>
                  <span className="text-emerald-600">{margin}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <Button variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => (s - 1) as Step))}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 2 ? (
            <Button onClick={goNext}>Continue</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : isEditing ? "Save changes" : isConsignment ? "Receive on consignment" : "Receive into inventory"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
