import { CatalogFieldInput } from "@/components/catalog/CatalogFieldInput";
import { categoryIcon } from "@/components/catalog/categoryIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/authContext";
import { BomEditor, type BomLists } from "@/features/inventory/BomEditor";
import { getCatalog, getMarketSettings, listCategories, suggestStockNumber } from "@/lib/api/catalogApi";
import { listInventory, receiveItem, updateItemDetails } from "@/lib/api/inventoryApi";
import {
  CARRY_FORWARD_KEYS,
  SECTION_ORDER,
  applyValues,
  copyableValues,
  fieldSuggestions,
  fieldsForSection,
  fieldsInSections,
  itemToValues,
  sameRaw,
  validateForm,
  visibleFields,
  withTypedDefaults,
  type RawValues,
} from "@/lib/inventory/catalogForm";
import { findUniqueConflicts, isBlank, parseNumber, type DateOrder } from "@/lib/inventory/fieldValues";
import { fieldsForCategory, optionsForField, type CatalogState, type OptionLookups } from "@/lib/inventory/registry";
import { addListEntry, getList, listLocationPaths } from "@/lib/store/masterDataStore";
import { cn, formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { CategoryDefinition, FieldDefinition, FieldSection, FieldValue } from "@/types/catalog";
import type { InventoryCategory, InventoryItem, JewelryComponent } from "@/types/inventory";
import type { MasterListEntry, MasterListKey } from "@/types/masterData";
import { ChevronDown, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface ReceiveItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item?: InventoryItem) => void;
  /** When set, the dialog edits this item instead of creating a new one. */
  editItem?: InventoryItem | null;
  /** Pre-fills a fresh receive (e.g. from a Purchase Order or Memo In line) — ignored when editItem is set. When memoInId is set, this is a consignment receive: no cost layer, a consignment value + price basis are captured instead. */
  prefill?: { vendorId?: string; purchaseOrderId?: string; memoInId?: string; category?: InventoryCategory; cost?: number; priceBasis?: string };
}

const SECTION_TITLES: Record<FieldSection, string> = {
  identity: "Identity & source",
  specification: "Specification",
  certificate: "Certificate",
  components: "Components",
  market: "Market",
  custom: "Custom fields",
  pricing: "Pricing",
};

/** Sections summarised in the right-hand rail as "what this piece is". */
const SPEC_SECTIONS: FieldSection[] = ["specification", "certificate"];

/** Pixels left above a field the form scrolls to, so its section heading stays visible for context. */
const SCROLL_HEADROOM = 80;

/** Fields that read better across more of the grid width. */
const WIDE_FIELDS = new Set(["title", "description", "location"]);

/** The last item saved in this session, per category — the source for "Copy from last item". */
const lastSaved = new Map<string, { raw: RawValues; components: JewelryComponent[] }>();

/** Master lists read once per dialog open (and re-read after an inline add), not on every keystroke. */
function cachedLookups(): OptionLookups {
  const lists = new Map<string, MasterListEntry[]>();
  let locations: string[] | undefined;
  return {
    getList: (key) => {
      if (!lists.has(key)) lists.set(key, getList(key as MasterListKey));
      return lists.get(key)!;
    },
    locationPaths: () => (locations ??= listLocationPaths().map((l) => l.path)),
  };
}

const EMPTY_CATALOG: CatalogState = { categories: [], overrides: {}, tenantFields: [], customFields: [], enabledPacks: [] };

export function ReceiveItemDialog({ open, onOpenChange, onSaved, editItem, prefill }: ReceiveItemDialogProps) {
  const { can } = useAuth();
  const isEditing = Boolean(editItem);
  const isConsignment = !isEditing && Boolean(prefill?.memoInId);
  const canAddMasterData = can("catalog", "edit");

  const [catalog, setCatalog] = useState<CatalogState>(EMPTY_CATALOG);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [dateOrder, setDateOrder] = useState<DateOrder>("MDY");
  const [existingItems, setExistingItems] = useState<InventoryItem[]>([]);
  const [listVersion, setListVersion] = useState(0);

  const [categoryKey, setCategoryKey] = useState<string>("");
  const [raw, setRaw] = useState<RawValues>({});
  const [original, setOriginal] = useState<RawValues | undefined>(undefined);
  const [components, setComponents] = useState<JewelryComponent[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  /**
   * Set on the first save attempt. Until then a field shows its error only once the user has
   * touched it, so a fresh form isn't a wall of red; afterwards everything wrong is visible at once.
   * This replaced the wizard's per-step `attempted` set, which had the same intent but could only
   * reveal errors on steps the user had already walked through.
   */
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const [consignmentValue, setConsignmentValue] = useState("");
  const [consignmentPriceBasis, setConsignmentPriceBasis] = useState("");
  const [saving, setSaving] = useState(false);
  /** Sections whose "More details" fields the user has opened. */
  const [expanded, setExpanded] = useState<Set<FieldSection>>(new Set());
  /** The scrolling body, so a failed save can bring the first bad field into view. */
  const bodyRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lookups = useMemo(cachedLookups, [open, listVersion]);
  const category = categories.find((c) => c.key === categoryKey) ?? catalog.categories.find((c) => c.key === categoryKey);

  const fields = useMemo(() => {
    const all = fieldsForCategory(catalog, categoryKey);
    // A consignment receipt carries no cost layer — consignment value replaces cost on the pricing step.
    return isConsignment ? all.filter((f) => f.key !== "cost") : all;
  }, [catalog, categoryKey, isConsignment]);

  const optionsFor = (field: FieldDefinition, resolved: Record<string, FieldValue>) => optionsForField(field, resolved, category, lookups);

  /* ------------------------------------------------------------ open / reset */

  const receivingLocation = (paths: string[]) => paths.find((p) => p.toLowerCase().includes("receiving")) ?? paths[0] ?? "";

  const freshValues = (target: CategoryDefinition | undefined, carry: RawValues = {}): RawValues => ({
    identityModel: target?.defaultIdentityModel,
    location: receivingLocation(lookups.locationPaths()),
    ...(prefill?.cost !== undefined && !prefill.memoInId ? { cost: String(prefill.cost) } : {}),
    ...carry,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getCatalog(), listCategories(), getMarketSettings(), listInventory()]).then(([state, active, market, items]) => {
      if (cancelled) return;
      setCatalog(state);
      setCategories(active);
      setDateOrder(market.dateOrder);
      setExistingItems(items);
      setTouched(new Set());
      setSubmitAttempted(false);
      setCodeTouched(false);
      setExpanded(new Set());
      if (editItem) {
        const values = itemToValues(editItem, fieldsForCategory(state, editItem.category));
        setCategoryKey(editItem.category);
        setRaw(values);
        setOriginal(values);
        setComponents(editItem.jewelry?.components ?? []);
      } else {
        const initial = active.find((c) => c.key === prefill?.category) ?? active[0];
        setCategoryKey(initial?.key ?? "");
        setRaw(freshValues(initial));
        setOriginal(undefined);
        setComponents([]);
        setConsignmentValue("");
        setConsignmentPriceBasis(prefill?.priceBasis ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem, prefill]);

  // Suggest the next stock number until the user types their own.
  useEffect(() => {
    if (!open || isEditing || codeTouched || !categoryKey) return;
    let cancelled = false;
    suggestStockNumber(categoryKey)
      .then((code) => !cancelled && setRaw((current) => ({ ...current, code })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, isEditing, codeTouched, categoryKey, existingItems]);

  /* ------------------------------------------------------------ validation */

  const validation = useMemo(() => validateForm(fields, raw, optionsFor, dateOrder, original), [fields, raw, dateOrder, original, lookups, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const { errors, warnings } = useMemo(() => {
    const merged = { ...validation.errors };
    const flagged = { ...validation.warnings };
    const conflicts = findUniqueConflicts(visibleFields(fields, raw), validation.values, existingItems, editItem?.id);
    for (const conflict of conflicts) {
      // A clash this item already had (a legacy placeholder serial) is shown, but doesn't block an unrelated edit.
      if (original && sameRaw(original[conflict.fieldKey], raw[conflict.fieldKey])) flagged[conflict.fieldKey] ??= conflict.message;
      else merged[conflict.fieldKey] ??= conflict.message;
    }
    return { errors: merged, warnings: flagged };
  }, [validation, fields, raw, existingItems, editItem, original]);

  const consignmentError = isConsignment && parseNumber(consignmentValue) === null ? "Consignment value is required" : undefined;

  const shownError = (field: FieldDefinition) => (touched.has(field.key) || submitAttempted ? errors[field.key] : undefined);

  /** Every blocking error on the form, in the order the fields are laid out — the first one is where a failed save scrolls to. */
  const blockingFields = useMemo(
    () => SECTION_ORDER.flatMap((section) => visibleFields(fieldsForSection(fields, section), raw)).filter((f) => errors[f.key]),
    [fields, raw, errors]
  );
  const errorCount = blockingFields.length + (consignmentError ? 1 : 0);

  const suggestions = useMemo(
    () => fieldSuggestions(categoryKey, validation.values, components, (n) => formatCurrency(n)),
    [categoryKey, validation.values, components]
  );

  /* ------------------------------------------------------------ actions */

  const setValue = (key: string, value: unknown) => {
    if (key === "code") setCodeTouched(true);
    setRaw((current) => {
      const next = { ...current, [key]: value };
      // A child list scoped by this field (karat by metal) is invalid once the parent changes.
      for (const f of fields) if (f.source?.kind === "masterList" && f.source.scopedByField === key && current[key] !== value) delete next[f.key];
      return next;
    });
  };
  const markTouched = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));

  const chooseCategory = (key: string) => {
    if (key === categoryKey) return;
    const target = categories.find((c) => c.key === key);
    const nextFields = new Set(fieldsForCategory(catalog, key).map((f) => f.key));
    // Keep what still applies (name, location, prices); drop the previous category's specification.
    const kept = Object.fromEntries(Object.entries(raw).filter(([k]) => nextFields.has(k) && k !== "identityModel" && (k !== "code" || codeTouched)));
    setCategoryKey(key);
    setRaw({ ...kept, identityModel: target?.defaultIdentityModel });
    setComponents([]);
    setTouched(new Set());
    // A different category asks different questions; holding the user to a failed save of the old one would be noise.
    setSubmitAttempted(false);
  };

  const addOption = (field: FieldDefinition) => (label: string) => {
    if (field.source?.kind !== "masterList") return;
    const scopeValue = field.source.scopedByField ? String(validation.values[field.source.scopedByField] ?? "") : undefined;
    addListEntry(field.source.key as MasterListKey, label, scopeValue || undefined);
    setListVersion((v) => v + 1);
    showSuccess("Added to master data", `"${label}" is now in the list.`);
  };

  /**
   * Brings the first problem into view and focuses it. The wizard used to do this implicitly by
   * jumping to the offending step; on one page the error can be several screens down, so it has to
   * be explicit or a failed save looks like nothing happened.
   */
  const revealFirstError = () => {
    const field = blockingFields[0];
    // CatalogFieldInput ids its control `field-<key>`; the consignment inputs are plain and own their id.
    const targetId = field ? `field-${field.key}` : consignmentError ? "consignment-value" : undefined;
    if (!targetId) return;
    // Open the "More details" collapse holding the field, or scrolling lands on a hidden block.
    if (field?.tier === "detail") setExpanded((current) => new Set(current).add(field.section));
    // After the collapse has rendered, so the field has a layout position to scroll to.
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      const control = body?.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`);
      if (!body || !control) return;
      // Scroll the labelled block, not the bare input, so it's clear which field is being pointed at.
      // Offset arithmetic rather than scrollIntoView: the latter is a no-op on this nested flex
      // scroller, and would also scroll the page behind the sheet if it did fire.
      const block = control.closest("[class*='space-y-1']") ?? control;
      const top = body.scrollTop + block.getBoundingClientRect().top - body.getBoundingClientRect().top - SCROLL_HEADROOM;
      body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      control.focus({ preventScroll: true });
    });
  };

  const copyFromLast = () => {
    const last = lastSaved.get(categoryKey);
    if (!last) return;
    setRaw((current) => ({ ...copyableValues(fields, last.raw), code: current.code, title: "" }));
    setComponents(last.components.map((c) => ({ ...c, id: crypto.randomUUID(), sourceItemId: undefined })));
    showSuccess("Copied", "Specification copied from the last item — give this one its own name.");
  };

  const handleSubmit = async (addAnother: boolean) => {
    setSubmitAttempted(true);
    if (errorCount > 0) {
      showError("Check the form", `${errorCount} field${errorCount === 1 ? " needs" : "s need"} attention.`);
      revealFirstError();
      return;
    }

    setSaving(true);
    try {
      const values = validation.values;
      let draft = applyValues<Partial<InventoryItem>>(editItem ?? {}, fields, raw, values);
      if (categoryKey === "Jewelry") draft = { ...draft, jewelry: { ...draft.jewelry!, components } };
      draft = withTypedDefaults(categoryKey, draft);

      const label = category?.label ?? categoryKey;
      const description = draft.description?.trim() || `${label} · received today`;
      let saved: InventoryItem | undefined;

      if (isEditing && editItem) {
        saved = await updateItemDetails(editItem.id, {
          title: draft.title ?? editItem.title,
          description,
          location: draft.location ?? editItem.location,
          quantity: draft.quantity,
          cost: draft.cost ?? 0,
          askingPrice: draft.askingPrice ?? 0,
          diamond: draft.diamond,
          jewelry: draft.jewelry,
          watch: draft.watch,
          customFields: draft.customFields,
          attributes: draft.attributes,
        });
        showSuccess("Saved", `${editItem.code} updated.`);
      } else {
        saved = await receiveItem({
          category: categoryKey,
          identityModel: draft.identityModel ?? category?.defaultIdentityModel ?? "UNIQUE",
          quantity: draft.quantity,
          code: draft.code ?? "",
          title: draft.title ?? "",
          description,
          location: draft.location ?? "",
          cost: isConsignment ? 0 : (draft.cost ?? 0),
          askingPrice: draft.askingPrice ?? 0,
          vendorId: prefill?.vendorId,
          purchaseOrderId: prefill?.purchaseOrderId,
          ownership: isConsignment ? "CONSIGNED_IN" : "OWNED",
          memoInId: prefill?.memoInId,
          consignmentValue: isConsignment ? (parseNumber(consignmentValue) ?? 0) : undefined,
          consignmentPriceBasis: isConsignment ? consignmentPriceBasis.trim() : undefined,
          diamond: draft.diamond,
          jewelry: draft.jewelry,
          watch: draft.watch,
          customFields: draft.customFields,
          attributes: draft.attributes,
        });
        lastSaved.set(categoryKey, { raw, components });
      }

      onSaved(saved);
      if (addAnother && saved) {
        showSuccess("Received", `${saved.code} added — ready for the next ${label.toLowerCase()} piece.`);
        const carry = Object.fromEntries(CARRY_FORWARD_KEYS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
        setRaw(freshValues(category, carry));
        setComponents([]);
        setTouched(new Set());
        setSubmitAttempted(false);
        setCodeTouched(false);
        bodyRef.current?.scrollTo({ top: 0 });
        setExistingItems(await listInventory()); // refreshes uniqueness checks and the next stock number
      } else {
        if (!isEditing) showSuccess(isConsignment ? "Received on consignment" : "Received", `${saved?.code} added to inventory.`);
        onOpenChange(false);
      }
    } catch (error: any) {
      showError("Could not save", error?.message || "Could not save this item.");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------ rendering */

  const renderField = (field: FieldDefinition) => {
    const derived = suggestions.find((s) => s.fieldKey === field.key);
    return (
      <CatalogFieldInput
        key={field.key}
        field={field}
        value={raw[field.key]}
        onChange={(value) => setValue(field.key, value)}
        onBlur={() => markTouched(field.key)}
        options={field.type === "select" || field.type === "multiselect" ? optionsFor(field, validation.values) : undefined}
        error={shownError(field)}
        warning={warnings[field.key]}
        fixSuggestion={validation.suggestions[field.key]}
        derived={derived && { label: field.unit === "ct" ? `${derived.value} ct` : formatCurrency(derived.value), basis: derived.basis, value: derived.value }}
        disabled={isEditing && (field.key === "code" || field.key === "identityModel")}
        onAddOption={canAddMasterData ? addOption(field) : undefined}
        className={cn((WIDE_FIELDS.has(field.key) || field.type === "multiselect") && "col-span-2", field.key === "description" && "col-span-3")}
      />
    );
  };

  /**
   * One section of the form: a heading, the essential fields in a 3-up grid, and a "More details"
   * collapse for the `tier: "detail"` fields so the ~30 fields a Diamond can carry don't all land at
   * once. `extra` is section-specific content that isn't catalog-driven (the BOM editor, the
   * consignment inputs).
   */
  const renderSection = (section: FieldSection, extra?: React.ReactNode) => {
    const inSection = visibleFields(fieldsForSection(fields, section), raw);
    if (inSection.length === 0 && !extra) return null;

    const essential = inSection.filter((f) => f.tier !== "detail");
    const detail = inSection.filter((f) => f.tier === "detail");
    // Details open themselves when they hold a value or an error — nothing entered is ever hidden.
    const open = expanded.has(section) || detail.some((f) => !isBlank(raw[f.key]) || shownError(f));
    const toggle = () =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        return next;
      });

    return (
      <section key={section} className="space-y-3 scroll-mt-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">{SECTION_TITLES[section]}</h3>
          <div className="h-px flex-1 bg-border" />
        </div>
        {essential.length > 0 && <div className="grid grid-cols-3 gap-4">{essential.map(renderField)}</div>}
        {extra}
        {detail.length > 0 && (
          <>
            <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
              {open ? "Fewer details" : `More ${SECTION_TITLES[section].toLowerCase()} details (${detail.length})`}
            </button>
            {open && <div className="grid grid-cols-3 gap-4 rounded-md bg-muted/30 p-3">{detail.map(renderField)}</div>}
          </>
        )}
      </section>
    );
  };

  const activeLabels = (key: string) => lookups.getList(key).filter((e) => e.active).map((e) => e.label);
  const bomLists: BomLists = {
    gemstoneTypes: activeLabels("gemstoneTypes"),
    shapes: activeLabels("diamondShapes"),
    colors: activeLabels("diamondColors"),
    clarities: activeLabels("diamondClarities"),
    fancyIntensities: activeLabels("fancyColorIntensities"),
    treatments: activeLabels("diamondTreatments"),
    labs: activeLabels("certificationLabs"),
  };

  const CategoryIcon = categoryIcon(category?.icon);
  const cost = isConsignment ? parseNumber(consignmentValue) : (validation.values.cost as number | undefined);
  const asking = validation.values.askingPrice as number | undefined;
  const margin = typeof cost === "number" && asking ? Math.round(((asking - cost) / asking) * 100) : null;
  const specSummary = visibleFields(fieldsInSections(fields, SPEC_SECTIONS), raw)
    .filter((f) => f.required && validation.values[f.key] !== undefined && f.type !== "boolean")
    .slice(0, 4);
  const canCopyLast = !isEditing && lastSaved.has(categoryKey);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="formLg" className="p-0 gap-0 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b shrink-0 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{isEditing ? `Edit ${editItem?.code}` : isConsignment ? "Receive on consignment" : "Receive inventory"}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEditing ? "Change any detail — status and custody are unaffected." : "Fill what you know; only starred fields are required."}
            </p>
          </div>
          {submitAttempted && errorCount > 0 && (
            <button type="button" onClick={revealFirstError} className="text-xs font-medium text-destructive hover:underline shrink-0 mt-1">
              {errorCount} field{errorCount === 1 ? "" : "s"} need attention
            </button>
          )}
        </div>

        {/* Body: one scrolling column of sections + live summary rail */}
        <div className="flex-1 flex min-h-0">
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground">Category</Label>
                {canCopyLast && (
                  <Button type="button" variant="ghost" size="sm" onClick={copyFromLast} className="h-7 text-xs">
                    <Copy className="h-3 w-3 mr-1" /> Copy from last item
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                {(isEditing && category ? [category] : categories).map((option) => {
                  const Icon = categoryIcon(option.icon);
                  const selected = categoryKey === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={isEditing}
                      aria-pressed={selected}
                      onClick={() => chooseCategory(option.key)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-colors",
                        selected ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {renderSection("identity")}
            {renderSection("specification")}
            {renderSection("certificate")}
            {renderSection("components", categoryKey === "Jewelry" ? <BomEditor components={components} onChange={setComponents} lists={bomLists} /> : undefined)}
            {renderSection("market")}
            {renderSection("custom")}

            {visibleFields(fieldsInSections(fields, SPEC_SECTIONS), raw).length === 0 && categoryKey !== "Jewelry" && (
              <p className="text-sm text-muted-foreground">{category?.label} has no specification fields yet — add them in Settings → Inventory Catalog.</p>
            )}

            {renderSection(
              "pricing",
              isConsignment ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="consignment-value" className="text-xs text-muted-foreground">
                      Consignment value<span className="text-destructive ml-0.5">*</span>
                    </Label>
                    <Input
                      id="consignment-value"
                      inputMode="decimal"
                      value={consignmentValue}
                      onChange={(e) => setConsignmentValue(e.target.value)}
                      className={cn("tabular-nums", submitAttempted && consignmentError && "border-destructive")}
                    />
                    {submitAttempted && consignmentError && <p className="text-xs text-destructive">{consignmentError}</p>}
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="consignment-basis" className="text-xs text-muted-foreground">
                      Price basis
                    </Label>
                    <Input id="consignment-basis" value={consignmentPriceBasis} onChange={(e) => setConsignmentPriceBasis(e.target.value)} placeholder="e.g. $5,800 net if sold" />
                  </div>
                </div>
              ) : undefined
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

          {/* Live summary rail */}
          <div className="w-64 shrink-0 border-l bg-muted/30 p-5 overflow-y-auto hidden sm:block">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-background border shrink-0">
                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{String(raw.title ?? "") || "Untitled item"}</p>
                <p className="text-xs text-muted-foreground truncate">{String(raw.code ?? "") || "No stock #"}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <Badge variant="outline">{category?.label ?? "—"}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identity</span>
                <span>
                  {String(raw.identityModel ?? "—")}
                  {validation.values.quantity !== undefined && ` · ${validation.values.quantity} pcs`}
                </span>
              </div>
              {specSummary.map((f) => (
                <div key={f.key} className="flex justify-between gap-2">
                  <span className="text-muted-foreground truncate">{f.label}</span>
                  <span className="truncate tabular-nums">
                    {String(validation.values[f.key])}
                    {f.unit ? (f.unit === "%" ? "%" : ` ${f.unit}`) : ""}
                  </span>
                </div>
              ))}
              {typeof raw.location === "string" && raw.location && (
                <div>
                  <span className="text-muted-foreground block">Location</span>
                  <span className="text-foreground">{raw.location}</span>
                </div>
              )}
            </div>
            {margin !== null && typeof cost === "number" && asking !== undefined && (
              <div className="mt-4 pt-4 border-t space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isConsignment ? "Consignment value" : "Cost"}</span>
                  <span className="tabular-nums">{formatCurrency(cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asking</span>
                  <span className="tabular-nums">{formatCurrency(asking)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Margin</span>
                  <span className={cn("tabular-nums", margin < 0 ? "text-destructive" : "text-emerald-600")}>{margin}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {!isEditing && !prefill && (
              <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>
                Save &amp; add another
              </Button>
            )}
            <Button onClick={() => handleSubmit(false)} disabled={saving}>
              {saving ? "Saving…" : isEditing ? "Save changes" : isConsignment ? "Receive on consignment" : "Receive into inventory"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
