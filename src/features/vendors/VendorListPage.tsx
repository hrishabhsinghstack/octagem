import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VendorFormDialog } from "@/features/vendors/VendorFormDialog";
import { useDataRefresh } from "@/hooks/useDataRefresh";
import { deleteVendor, listVendors } from "@/lib/api/vendorApi";
import { showSuccess } from "@/lib/utils";
import type { Vendor } from "@/types/party";
import { MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

export function VendorListPage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  const refresh = () => listVendors().then(setVendors);
  useDataRefresh(refresh);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => `${v.name} ${v.contact} ${v.email}`.toLowerCase().includes(q));
  }, [vendors, query]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditing(vendor);
    setFormOpen(true);
  };

  const handleDelete = async (vendor: Vendor) => {
    if (!window.confirm(`Remove vendor ${vendor.name}?`)) return;
    await deleteVendor(vendor.id);
    showSuccess("Removed", `${vendor.name} removed.`);
    refresh();
  };

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground mt-1">Suppliers you purchase or consign inventory from.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Add vendor
        </Button>
      </div>

      <div className="relative w-80">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors…" className="pl-8" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((vendor) => (
              <TableRow key={vendor.id} className="cursor-pointer" onClick={() => navigate(`/vendors/${vendor.id}`)}>
                <TableCell>
                  <div className="font-medium">{vendor.name}</div>
                  <div className="text-xs text-muted-foreground">{vendor.id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{vendor.contact}</div>
                  <div className="text-xs text-muted-foreground">{vendor.email || vendor.phone}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{vendor.paymentTerms}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{vendor.currency}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(vendor)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(vendor)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <div className="py-16 text-center text-muted-foreground">No vendors found.</div>}
      </Card>

      <VendorFormDialog open={formOpen} onOpenChange={setFormOpen} vendor={editing} onSaved={refresh} />
    </div>
    <Outlet />
    </>
  );
}
