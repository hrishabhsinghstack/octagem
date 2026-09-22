import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Can } from "@/components/rbac/Can";
import { useAuth } from "@/contexts/authContext";
import { ItemMediaPanel } from "@/features/inventory/ItemMediaPanel";
import { ReceiveItemDialog } from "@/features/inventory/ReceiveItemDialog";
import { IssueMemoDialog } from "@/features/memo/IssueMemoDialog";
import { listCustomFieldDefinitions } from "@/lib/api/customFieldApi";
import { deleteItem, duplicateItem, getItem } from "@/lib/api/inventoryApi";
import { returnItemToVendor } from "@/lib/api/memoInApi";
import { getVendor } from "@/lib/api/vendorApi";
import { recordRecentActivity } from "@/lib/recentActivity";
import { formatCurrency, formatDateShort, showError, showSuccess } from "@/lib/utils";
import type { CustomFieldDefinition } from "@/types/customField";
import type { InventoryItem, ItemStatus } from "@/types/inventory";
import { Copy, Handshake, MapPin, MoreVertical, Pencil, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const STATUS_VARIANT: Record<ItemStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Available: "success",
  "On memo out": "warning",
  Reserved: "secondary",
  "Verification hold": "outline",
  Sold: "outline",
  "Returned to vendor": "destructive",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-6 mb-3 first:mt-0">{children}</p>;
}

function DiamondSpec({ item }: { item: InventoryItem }) {
  const d = item.diamond!;
  return (
    <>
      <SectionLabel>Grading</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Shape" value={d.shape} />
        <Field label="Carat" value={d.caratWeight.toFixed(2)} />
        <Field label="Measurements" value={d.measurements && `${d.measurements.lengthMm} × ${d.measurements.widthMm} × ${d.measurements.depthMm} mm`} />
        <Field label="Stone ratio" value={d.stoneRatio?.toFixed(2)} />
        <Field label="Color" value={d.color} />
        <Field label="Fancy color" value={d.fancyColor && `${d.fancyColor.intensity}${d.fancyColor.overtone ? ` ${d.fancyColor.overtone}` : ""}`} />
        <Field label="Clarity" value={d.clarity} />
        <Field label="Cut" value={d.cut} />
        <Field label="Polish" value={d.polish} />
        <Field label="Symmetry" value={d.symmetry} />
        <Field label="Fluorescence" value={d.fluorescence} />
        <Field label="Depth %" value={d.depthPct} />
        <Field label="Table %" value={d.tablePct} />
        <Field label="Crown angle" value={d.crownAngle && `${d.crownAngle}°`} />
        <Field label="Pavilion angle" value={d.pavilionAngle && `${d.pavilionAngle}°`} />
        <Field label="Girdle" value={d.girdle} />
        <Field label="Culet" value={d.culet} />
        <Field label="Treatment" value={d.treatment} />
        <Field label="Eye clean" value={d.eyeClean} />
        <Field label="Matching stone" value={d.matchingStoneCode} />
      </dl>

      <SectionLabel>Certificate &amp; origin</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Lab" value={d.lab} />
        <Field label="Certificate #" value={d.certificateNumber || "Uncertified"} />
        <Field label="Certificate date" value={d.certificateDate && formatDateShort(d.certificateDate)} />
        <Field label="Origin" value={d.isLabGrown ? "Laboratory-grown" : "Natural"} />
        <Field label="Certificate comments" value={d.certificateComments} />
      </dl>

      {(d.rapPricePerCarat || d.channels?.length) && (
        <>
          <SectionLabel>Pricing reference &amp; distribution</SectionLabel>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Rap price / ct" value={d.rapPricePerCarat && formatCurrency(d.rapPricePerCarat)} />
            <Field label="Discount off Rap" value={d.rapDiscountPct && `${d.rapDiscountPct}%`} />
            <Field label="Rap list date" value={d.rapListDate && formatDateShort(d.rapListDate)} />
          </dl>
          {!!d.channels?.length && (
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {d.channels.map((channel) => (
                <Badge key={channel} variant="outline">
                  {channel}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}

      {d.onHold && (
        <>
          <SectionLabel>Hold</SectionLabel>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Customer" value={d.onHold.customer} />
            <Field label="Expires" value={formatDateShort(d.onHold.expiresAt)} />
          </dl>
        </>
      )}
    </>
  );
}

function JewelrySpec({ item }: { item: InventoryItem }) {
  const j = item.jewelry!;
  return (
    <>
      <SectionLabel>Style &amp; construction</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Style #" value={j.styleNumber} />
        <Field label="Group" value={j.group} />
        <Field label="Sub-category" value={j.subCategory} />
        <Field label="Metal" value={`${j.metalColor ? `${j.metalColor} ` : ""}${j.metalType}${j.metalKarat ? ` (${j.metalKarat})` : ""}`} />
        <Field label="Gross weight" value={`${j.grossWeightGrams} g`} />
        <Field label="Net weight" value={j.netWeightGrams && `${j.netWeightGrams} g`} />
        <Field label="Size / width" value={j.sizeWidth} />
        <Field label="Setting type" value={j.settingType} />
        <Field label="Hallmark" value={j.hallmark} />
        <Field label="Vendor stock #" value={j.vendorStockNumber} />
        <Field label="Total diamond weight" value={j.totalDiamondCarats && `${j.totalDiamondCarats} ct`} />
        <Field label="Total gem weight" value={j.totalGemCarats && `${j.totalGemCarats} ct`} />
      </dl>

      <SectionLabel>Bill of materials</SectionLabel>
      {j.components.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Shape</TableHead>
              <TableHead>Color / Clarity</TableHead>
              <TableHead>Fancy / Treatment</TableHead>
              <TableHead>Lab / Cert #</TableHead>
              <TableHead>Size / Stone #</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {j.components.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.type}</TableCell>
                <TableCell className="text-muted-foreground">{c.shape ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.color || c.clarity ? `${c.color ?? ""}${c.color && c.clarity ? " / " : ""}${c.clarity ?? ""}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.fancyColor?.intensity || c.treatment
                    ? `${c.fancyColor?.intensity ?? ""}${c.fancyColor?.intensity && c.treatment ? " / " : ""}${c.treatment ?? ""}`
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.certificateNumber || c.lab || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.size || c.stoneNumber ? `${c.size ?? ""}${c.size && c.stoneNumber ? " / " : ""}${c.stoneNumber ?? ""}` : "—"}</TableCell>
                <TableCell className="text-right">{c.quantity}</TableCell>
                <TableCell className="text-right">{c.weightCarats ? `${c.weightCarats} ct` : "—"}</TableCell>
                <TableCell>{c.isCenter ? <Badge variant="secondary">Center</Badge> : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.sourceItemId ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No mounted components — plain metal piece.</p>
      )}
    </>
  );
}

function WatchSpec({ item }: { item: InventoryItem }) {
  const w = item.watch!;
  return (
    <>
      <SectionLabel>Identification</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Brand" value={w.brand} />
        <Field label="Model" value={w.model} />
        <Field label="Gender" value={w.gender} />
        <Field label="Reference #" value={w.referenceNumber} />
        <Field label="Serial #" value={w.serialNumber} />
        <Field label="Year of production" value={w.yearOfProduction} />
        <Field label="Diamond weight" value={w.diamondWeightCarats && `${w.diamondWeightCarats} ct`} />
      </dl>

      <SectionLabel>Case, dial &amp; movement</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Case material" value={w.caseMaterial} />
        <Field label="Case size" value={w.caseSizeMm && `${w.caseSizeMm} mm`} />
        <Field label="Movement" value={w.movement} />
        <Field label="Dial" value={w.dial} />
        <Field label="Bezel" value={w.bezel} />
        <Field label="Bracelet" value={w.bracelet} />
      </dl>

      {w.features && w.features.length > 0 && (
        <>
          <SectionLabel>Features</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {w.features.map((feature) => (
              <Badge key={feature} variant="outline">
                {feature}
              </Badge>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Condition &amp; completeness</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Condition" value={w.conditionGrade} />
        <Field label="Box" value={w.hasBox ? "Yes" : "No"} />
        <Field label="Papers" value={w.hasPapers ? "Yes" : "No"} />
        <Field label="Warranty card date" value={w.warrantyCardDate && formatDateShort(w.warrantyCardDate)} />
      </dl>

      {w.authentication && (
        <>
          <SectionLabel>Authentication</SectionLabel>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Status" value={w.authentication.status} />
            <Field label="Verified by" value={w.authentication.verifiedBy} />
            <Field label="Verified at" value={w.authentication.verifiedAt && formatDateShort(w.authentication.verifiedAt)} />
          </dl>
        </>
      )}

      <SectionLabel>Service history</SectionLabel>
      {w.serviceHistory && w.serviceHistory.length > 0 ? (
        <div className="space-y-2">
          {w.serviceHistory.map((event, index) => (
            <div key={index} className="flex gap-3 text-sm">
              <span className="text-muted-foreground shrink-0">{formatDateShort(event.date)}</span>
              <span>{event.note}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No service events recorded.</p>
      )}
    </>
  );
}

function CustomFieldsSpec({ item }: { item: InventoryItem }) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    listCustomFieldDefinitions().then(setDefinitions);
  }, []);

  const populated = definitions.filter((d) => d.active && item.customFields?.[d.id] !== undefined && item.customFields[d.id] !== "");
  if (populated.length === 0) return null;

  const formatValue = (definition: CustomFieldDefinition) => {
    const value = item.customFields![definition.id];
    if (definition.type === "boolean") return value ? "Yes" : "No";
    if (definition.type === "date") return formatDateShort(String(value));
    return String(value);
  };

  return (
    <>
      <SectionLabel>Custom fields</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        {populated.map((definition) => (
          <Field key={definition.id} label={definition.label} value={formatValue(definition)} />
        ))}
      </dl>
    </>
  );
}

function PricingTab({ item }: { item: InventoryItem }) {
  const margin = item.askingPrice ? Math.round(((item.askingPrice - item.cost) / item.askingPrice) * 100) : 0;

  const extraTiers: [string, number][] = item.jewelry
    ? [
        ...(item.jewelry.metalCost ? ([["Metal cost", item.jewelry.metalCost]] as [string, number][]) : []),
        ...(item.jewelry.jewelryExpense ? ([["Jewelry expense", item.jewelry.jewelryExpense]] as [string, number][]) : []),
        ...(item.jewelry.mountingSellPrice ? ([["Mounting sell price", item.jewelry.mountingSellPrice]] as [string, number][]) : []),
        ...(item.jewelry.tagPrice ? ([["Tag price", item.jewelry.tagPrice]] as [string, number][]) : []),
        ...(item.jewelry.retailPrice ? ([["Retail price", item.jewelry.retailPrice]] as [string, number][]) : []),
      ]
    : item.watch
    ? [
        ...(item.watch.basePrice ? ([["Base price", item.watch.basePrice]] as [string, number][]) : []),
        ...(item.watch.retailPrice ? ([["Retail price", item.watch.retailPrice]] as [string, number][]) : []),
      ]
    : [];

  const markupPct = item.jewelry?.markupPct ?? item.watch?.markupPct;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Price &amp; Margin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Acquisition cost</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(item.cost)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Asking price</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(item.askingPrice)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Gross margin</p>
            <p className="text-lg font-semibold mt-1 text-emerald-600">{margin}%</p>
          </div>
        </div>
        {(extraTiers.length > 0 || markupPct !== undefined) && (
          <div className="grid grid-cols-3 gap-4">
            {extraTiers.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-dashed p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-medium mt-1">{formatCurrency(value)}</p>
              </div>
            ))}
            {markupPct !== undefined && (
              <div className="rounded-lg border border-dashed p-4">
                <p className="text-xs text-muted-foreground">Markup %</p>
                <p className="text-base font-medium mt-1">{markupPct}%</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ItemDetailPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);

  const refresh = () => {
    if (id)
      getItem(id).then((found) => {
        setItem(found ?? null);
        if (found) recordRecentActivity({ type: "inventory", id: found.id, label: `${found.code} · ${found.title}`, sublabel: found.category, path: `/inventory/${found.id}` });
      });
  };

  useEffect(refresh, [id]);

  const close = () => navigate("/inventory");

  const canIssueMemo = item ? item.status === "Available" || item.status === "Reserved" : false;
  const canReturnToVendor = item ? item.ownership === "CONSIGNED_IN" && item.status !== "Sold" && item.status !== "Returned to vendor" : false;

  const handleReturnToVendor = async () => {
    if (!item) return;
    if (!window.confirm(`Return ${item.code} to the vendor? This closes its consignment.`)) return;
    const vendor = item.vendorId ? await getVendor(item.vendorId) : undefined;
    await returnItemToVendor(item.id, vendor?.name ?? "vendor");
    showSuccess("Returned to vendor", `${item.code} marked Returned to vendor.`);
    refresh();
  };

  const handleDuplicate = async () => {
    if (!item) return;
    const suggested = `${item.code}-COPY`;
    const newCode = window.prompt("Stock number for the duplicate:", suggested);
    if (!newCode?.trim()) return;
    try {
      const copy = await duplicateItem(item.id, newCode.trim().toUpperCase());
      if (!copy) throw new Error("Could not duplicate this item.");
      showSuccess("Duplicated", `${copy.code} created from ${item.code}.`);
      navigate(`/inventory/${copy.id}`);
    } catch (error: any) {
      showError("Error", error?.message || "Could not duplicate this item.");
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!window.confirm(`Remove ${item.code} from inventory? This cannot be undone.`)) return;
    await deleteItem(item.id);
    showSuccess("Removed", `${item.code} removed from inventory.`);
    close();
  };

  if (!item) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent size="formLg" className="p-8">
          <p className="text-muted-foreground">Item not found.</p>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={(next) => !next && close()}>
      <SheetContent size="formLg" className="p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {item.category} · {item.code}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{item.title}</h1>
            <p className="text-muted-foreground mt-1">{item.description}</p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
              {item.ownership === "CONSIGNED_IN" && <Badge variant="outline">Consigned</Badge>}
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {item.location}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canIssueMemo && can("memoOut", "create") && (
              <Button variant="outline" onClick={() => setMemoOpen(true)}>
                <Handshake className="h-4 w-4 mr-2" /> Issue memo
              </Button>
            )}
            <Can module="inventory" action="edit">
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
            </Can>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <Can module="inventory" action="create">
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="h-4 w-4 mr-2" /> Duplicate
                  </DropdownMenuItem>
                </Can>
                {canReturnToVendor && can("inventory", "edit") && (
                  <DropdownMenuItem onClick={handleReturnToVendor}>
                    <Undo2 className="h-4 w-4 mr-2" /> Return to vendor
                  </DropdownMenuItem>
                )}
                <Can module="inventory" action="delete">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Remove from inventory
                  </DropdownMenuItem>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs defaultValue="identity">
          <TabsList>
            <TabsTrigger value="identity">Identity &amp; Specification</TabsTrigger>
            <TabsTrigger value="media">
              Media{item.media.length > 0 && <Badge variant="secondary" className="ml-1.5 px-1.5">{item.media.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="movement">Movement &amp; Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="identity">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identity &amp; Specification</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <Field label="Identity model" value={item.identityModel} />
                  <Field label="Received" value={formatDateShort(item.receivedAt)} />
                </dl>
                <Separator className="my-4" />
                {item.diamond && <DiamondSpec item={item} />}
                {item.jewelry && <JewelrySpec item={item} />}
                {item.watch && <WatchSpec item={item} />}
                <CustomFieldsSpec item={item} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="media">
            <ItemMediaPanel item={item} onChanged={refresh} />
          </TabsContent>

          <TabsContent value="pricing">
            <PricingTab item={item} />
          </TabsContent>

          <TabsContent value="movement">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inventory Ledger</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {item.ledger.map((entry) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center pt-1">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="w-px flex-1 bg-border" />
                      </div>
                      <div className="pb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{entry.type.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground">{formatDateShort(entry.occurredAt)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{entry.note}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.actor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ReceiveItemDialog open={editOpen} onOpenChange={setEditOpen} editItem={item} onSaved={refresh} />
        <IssueMemoDialog open={memoOpen} onOpenChange={setMemoOpen} onIssued={refresh} preselectedItemId={item.id} />
      </SheetContent>
    </Sheet>
  );
}
