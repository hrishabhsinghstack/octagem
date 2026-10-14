import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerMaterialDialog, LeftoverDialog, ReturnMaterialDialog, UseFromStockDialog } from "@/features/jobs/MaterialDialogs";
import { markStoneLost, removeCustomerMaterial, setCustomerMaterialStatus } from "@/lib/api/jobMaterialsApi";
import { outstandingFor } from "@/lib/job/materials";
import { formatCurrency, formatDateShort, showError, showSuccess } from "@/lib/utils";
import type { CustomerMaterialStatus, JobCostEntry, JobOrder } from "@/types/jobOrder";
import { PackageMinus, PackagePlus, Plus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface JobMaterialsTabProps {
  job: JobOrder;
  baseCurrency: string;
  canSeeCost: boolean;
  /** Can move stock in and out of the job (jobs + inventory edit). */
  canMoveStock: boolean;
  canEdit: boolean;
  onChanged: () => void;
}

const qty = (q?: { pieces?: number; carats?: number }) => [q?.carats ? `${q.carats} ct` : "", q?.pieces ? `${q.pieces} pcs` : ""].filter(Boolean).join(" · ");

const CUSTOMER_STATUS_VARIANT: Record<CustomerMaterialStatus, "outline" | "success" | "secondary"> = { Held: "outline", Used: "success", Returned: "secondary" };

export function JobMaterialsTab({ job, baseCurrency, canSeeCost, canMoveStock, canEdit, onChanged }: JobMaterialsTabProps) {
  const [useOpen, setUseOpen] = useState(false);
  const [leftoverOpen, setLeftoverOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [returning, setReturning] = useState<JobCostEntry | null>(null);

  const cancelled = job.status === "Cancelled";
  const consumptions = job.costEntries.filter((e) => e.source === "StockConsumption");
  const leftovers = job.costEntries.filter((e) => e.source === "ReturnToStock" && !e.reversesEntryId);
  const dialogProps = { job, baseCurrency, showCost: canSeeCost, onSaved: onChanged };

  const handleLost = async (entry: JobCostEntry) => {
    const reason = window.prompt(`What happened to ${entry.inventoryItemId}? Its cost stays on the job.`, "Chipped while setting");
    if (reason === null) return;
    try {
      await markStoneLost(job.id, entry.id, reason);
      showSuccess("Marked lost", `${entry.inventoryItemId} marked lost.`);
      onChanged();
    } catch (error: any) {
      showError("Could not mark it lost", error?.message);
    }
  };

  const changeCustomerStatus = async (id: string, status: CustomerMaterialStatus) => {
    await setCustomerMaterialStatus(job.id, id, status);
    onChanged();
  };

  const removeCustomer = async (id: string) => {
    if (!window.confirm("Remove this entry? Use this only for something entered by mistake.")) return;
    try {
      await removeCustomerMaterial(job.id, id);
      onChanged();
    } catch (error: any) {
      showError("Can't remove", error?.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Stock used on this job</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Stones and parcels taken from inventory. Whatever isn't used can go back at the rate it was taken.</p>
          </div>
          {canMoveStock && (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setLeftoverOpen(true)} disabled={cancelled}>
                <PackagePlus className="h-3.5 w-3.5 mr-1" /> Leftover to stock
              </Button>
              <Button size="sm" onClick={() => setUseOpen(true)} disabled={cancelled}>
                <PackageMinus className="h-3.5 w-3.5 mr-1" /> Use from stock
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {consumptions.length === 0 && leftovers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing taken from stock yet. Use a certified stone or part of a melee parcel you already hold.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Stock item</TableHead>
                  <TableHead>Taken</TableHead>
                  <TableHead>Still on job</TableHead>
                  {canSeeCost && <TableHead className="text-right">Cost on job</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumptions.map((entry) => {
                  const left = outstandingFor(job, entry);
                  const lost = entry.outcome === "Lost";
                  const allBack = left.amount <= 0.005;
                  const partBack = !allBack && left.amount < entry.amountBase - 0.005;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateShort(entry.occurredAt)}</TableCell>
                      <TableCell>
                        <Link to={`/inventory/${entry.inventoryItemId}`} className="text-sm font-medium hover:underline">
                          {entry.inventoryItemId}
                        </Link>
                        <p className="text-xs text-muted-foreground">{entry.description.replace(`${entry.inventoryItemId} · `, "")}</p>
                      </TableCell>
                      <TableCell className="text-sm">{qty(entry.quantity) || "Whole stone"}</TableCell>
                      <TableCell className="text-sm">{allBack ? "—" : entry.quantity ? qty(left) || "—" : "Whole stone"}</TableCell>
                      {canSeeCost && <TableCell className="text-right tabular-nums">{formatCurrency(left.amount, baseCurrency)}</TableCell>}
                      <TableCell>
                        {lost ? (
                          <Badge variant="destructive">Lost</Badge>
                        ) : allBack ? (
                          <Badge variant="secondary">Returned</Badge>
                        ) : partBack ? (
                          <Badge variant="warning">Part returned</Badge>
                        ) : (
                          <Badge variant="outline">On job</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {canMoveStock && !lost && !allBack && !cancelled && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setReturning(entry)}>
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Return
                            </Button>
                            {!entry.quantity && (
                              <Button size="sm" variant="ghost" onClick={() => handleLost(entry)}>
                                Mark lost
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {leftovers.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateShort(entry.occurredAt)}</TableCell>
                    <TableCell>
                      <Link to={`/inventory/${entry.inventoryItemId}`} className="text-sm font-medium hover:underline">
                        {entry.inventoryItemId}
                      </Link>
                      <p className="text-xs text-muted-foreground">Leftover sent to stock</p>
                    </TableCell>
                    <TableCell className="text-sm">{qty(entry.quantity)}</TableCell>
                    <TableCell className="text-sm">—</TableCell>
                    {canSeeCost && <TableCell className="text-right tabular-nums text-amber-700">{formatCurrency(entry.amountBase, baseCurrency)}</TableCell>}
                    <TableCell>
                      <Badge variant="secondary">To stock</Badge>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Customer's material</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Stones or gold the customer handed over. No cost to the job — a record of what you hold for them.</p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setCustomerOpen(true)} disabled={cancelled}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Record material
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {job.customerMaterials.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No customer material on this job.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead className="text-right">Declared value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.customerMaterials.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateShort(m.receivedAt)}</TableCell>
                    <TableCell>
                      <p className="text-sm">{m.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.kind}
                        {m.notes ? ` · ${m.notes}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{[qty(m), m.grams ? `${m.grams} g` : ""].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="text-sm">{m.certificateNumber || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{m.declaredValue ? formatCurrency(m.declaredValue, baseCurrency) : "—"}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select value={m.status} onValueChange={(v) => changeCustomerStatus(m.id, v as CustomerMaterialStatus)}>
                          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Held">Held</SelectItem>
                            <SelectItem value="Used">Used in the piece</SelectItem>
                            <SelectItem value="Returned">Returned to customer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={CUSTOMER_STATUS_VARIANT[m.status]}>{m.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="w-10">
                      {canEdit && m.status === "Held" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCustomer(m.id)} aria-label="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UseFromStockDialog open={useOpen} onOpenChange={setUseOpen} {...dialogProps} />
      <LeftoverDialog open={leftoverOpen} onOpenChange={setLeftoverOpen} {...dialogProps} />
      <CustomerMaterialDialog open={customerOpen} onOpenChange={setCustomerOpen} {...dialogProps} />
      <ReturnMaterialDialog open={Boolean(returning)} onOpenChange={(open) => !open && setReturning(null)} entry={returning} {...dialogProps} />
    </div>
  );
}
