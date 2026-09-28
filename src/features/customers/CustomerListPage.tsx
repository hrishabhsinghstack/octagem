import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerFormDialog } from "@/features/customers/CustomerFormDialog";
import { deleteCustomer, listCustomers } from "@/lib/api/customerApi";
import { formatCurrency, showSuccess } from "@/lib/utils";
import type { Customer } from "@/types/party";
import { MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

export function CustomerListPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const refresh = () => listCustomers().then(setCustomers);
  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => `${c.name} ${c.contact} ${c.email}`.toLowerCase().includes(q));
  }, [customers, query]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const handleDelete = async (customer: Customer) => {
    if (!window.confirm(`Remove customer ${customer.name}?`)) return;
    await deleteCustomer(customer.id);
    showSuccess("Removed", `${customer.name} removed.`);
    refresh();
  };

  return (
    <>
    <div className="p-8 space-y-6 max-w-[1200px] print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-1">Parties you memo and invoice.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Add customer
        </Button>
      </div>

      <div className="relative w-80">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" className="pl-8" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead className="text-right">Credit limit</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow key={customer.id} className="cursor-pointer" onClick={() => navigate(`/customers/${customer.id}`)}>
                <TableCell>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-xs text-muted-foreground">{customer.id}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{customer.type}</Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{customer.contact}</div>
                  <div className="text-xs text-muted-foreground">{customer.email || customer.phone}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{customer.paymentTerms}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{customer.creditLimit ? formatCurrency(customer.creditLimit) : "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(customer)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(customer)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && <div className="py-16 text-center text-muted-foreground">No customers found.</div>}
      </Card>

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} onSaved={refresh} />
    </div>
    <Outlet />
    </>
  );
}
