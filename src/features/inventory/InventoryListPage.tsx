import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Can } from "@/components/rbac/Can";
import { useAuth } from "@/contexts/authContext";
import { ReceiveItemDialog } from "@/features/inventory/ReceiveItemDialog";
import { IssueMemoDialog } from "@/features/memo/IssueMemoDialog";
import { deleteItem, duplicateItem, listInventory } from "@/lib/api/inventoryApi";
import { returnItemToVendor } from "@/lib/api/memoInApi";
import { getVendor } from "@/lib/api/vendorApi";
import { formatCurrency, showError, showSuccess } from "@/lib/utils";
import type { InventoryCategory, InventoryItem, ItemStatus } from "@/types/inventory";
import { Copy, Diamond, Gem, Handshake, MoreVertical, PackagePlus, Pencil, Search, Trash2, Undo2, Watch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

const CATEGORY_ICON: Record<InventoryCategory, typeof Diamond> = { Diamond: Diamond, Jewelry: Gem, Watch: Watch };

const STATUS_VARIANT: Record<ItemStatus, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  Available: "success",
  "On memo out": "warning",
  Reserved: "secondary",
  "Verification hold": "outline",
  Sold: "outline",
  "Returned to vendor": "destructive",
};

export function InventoryListPage() {
  const navigate = useNavigate();
  const { session, can, scopeFor } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [category, setCategory] = useState<InventoryCategory | "All">("All");
  const [status, setStatus] = useState<ItemStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [memoItemId, setMemoItemId] = useState<string | null>(null);

  const refresh = () => listInventory().then(setItems);

  const handleDuplicate = async (item: InventoryItem) => {
    const suggested = `${item.code}-COPY`;
    const newCode = window.prompt("Stock number for the duplicate:", suggested);
    if (!newCode?.trim()) return;
    try {
      const copy = await duplicateItem(item.id, newCode.trim().toUpperCase());
      if (!copy) throw new Error("Could not duplicate this item.");
      showSuccess("Duplicated", `${copy.code} created from ${item.code}.`);
      refresh();
    } catch (error: any) {
      showError("Error", error?.message || "Could not duplicate this item.");
    }
  };

  const handleReturnToVendor = async (item: InventoryItem) => {
    if (!window.confirm(`Return ${item.code} to the vendor? This closes its consignment.`)) return;
    const vendor = item.vendorId ? await getVendor(item.vendorId) : undefined;
    await returnItemToVendor(item.id, vendor?.name ?? "vendor");
    showSuccess("Returned to vendor", `${item.code} marked Returned to vendor.`);
    refresh();
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`Remove ${item.code} from inventory? This cannot be undone.`)) return;
    await deleteItem(item.id);
    showSuccess("Removed", `${item.code} removed from inventory.`);
    refresh();
  };

  useEffect(() => {
    refresh();
  }, []);

  const scope = scopeFor("inventory");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (scope === "own" && item.ledger[item.ledger.length - 1]?.actor !== session?.name) return false;
      if (category !== "All" && item.category !== category) return false;
      if (status !== "All" && item.status !== status) return false;
      if (!q) return true;
      const haystack = `${item.code} ${item.title} ${item.description} ${item.location}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, category, status, query, scope, session?.name]);

  const counts = useMemo(() => {
    const base: Record<InventoryCategory | "All", number> = { All: items.length, Diamond: 0, Jewelry: 0, Watch: 0 };
    items.forEach((item) => {
      base[item.category] += 1;
    });
    return base;
  }, [items]);

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1400px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1">Every diamond, jewelry piece and watch — its identity, custody and value in one place.</p>
        </div>
        <Can module="inventory" action="create">
          <Button onClick={() => setReceiveOpen(true)}>
            <PackagePlus className="h-4 w-4 mr-2" /> Receive inventory
          </Button>
        </Can>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={category} onValueChange={(value) => setCategory(value as InventoryCategory | "All")}>
          <TabsList>
            {(["All", "Diamond", "Jewelry", "Watch"] as const).map((option) => (
              <TabsTrigger key={option} value={option}>
                {option} <span className="ml-1.5 text-xs text-muted-foreground">{counts[option]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stock #, certificate, location…" className="pl-8 w-72" />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as ItemStatus | "All")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All statuses</SelectItem>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="On memo out">On memo out</SelectItem>
              <SelectItem value="Reserved">Reserved</SelectItem>
              <SelectItem value="Verification hold">Verification hold</SelectItem>
              <SelectItem value="Sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Identity</TableHead>
              <TableHead>Custody &amp; Location</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Asking</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const Icon = CATEGORY_ICON[item.category];
              const primaryPhoto = item.media.find((m) => m.isPrimary) ?? item.media[0];
              const canIssueMemo = item.status === "Available" || item.status === "Reserved";
              return (
                <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/inventory/${item.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0 overflow-hidden">
                        {primaryPhoto ? <img src={primaryPhoto.dataUrl} alt={item.title} className="h-full w-full object-cover" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.code} · {item.description}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.identityModel}</TableCell>
                  <TableCell>
                    <div className="text-sm">{item.custodyHolder}</div>
                    <div className="text-xs text-muted-foreground">{item.location}</div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(item.cost)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(item.askingPrice)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
                      {item.ownership === "CONSIGNED_IN" && <Badge variant="outline">Consigned</Badge>}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canIssueMemo && can("memoOut", "create") && (
                          <DropdownMenuItem onClick={() => setMemoItemId(item.id)}>
                            <Handshake className="h-4 w-4 mr-2" /> Issue memo
                          </DropdownMenuItem>
                        )}
                        <Can module="inventory" action="edit">
                          <DropdownMenuItem onClick={() => setEditingItem(item)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                        </Can>
                        <Can module="inventory" action="create">
                          <DropdownMenuItem onClick={() => handleDuplicate(item)}>
                            <Copy className="h-4 w-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                        </Can>
                        {item.ownership === "CONSIGNED_IN" && item.status !== "Sold" && item.status !== "Returned to vendor" && can("inventory", "edit") && (
                          <DropdownMenuItem onClick={() => handleReturnToVendor(item)}>
                            <Undo2 className="h-4 w-4 mr-2" /> Return to vendor
                          </DropdownMenuItem>
                        )}
                        <Can module="inventory" action="delete">
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(item)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Remove
                          </DropdownMenuItem>
                        </Can>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">
            <Search className="h-6 w-6 mx-auto mb-2" />
            No inventory matches this filter.
          </div>
        )}
      </Card>

      <ReceiveItemDialog open={receiveOpen} onOpenChange={setReceiveOpen} onSaved={refresh} />
      <ReceiveItemDialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)} editItem={editingItem} onSaved={refresh} />
      <IssueMemoDialog open={Boolean(memoItemId)} onOpenChange={(open) => !open && setMemoItemId(null)} onIssued={refresh} preselectedItemId={memoItemId ?? undefined} />
    </div>
    <Outlet />
    </>
  );
}
