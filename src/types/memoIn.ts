import type { InventoryCategory } from "@/types/inventory";

/**
 * §13.5 — symmetric to Memo Out, custody direction reversed. Structured like a Purchase Order
 * (expected → received lines) rather than Memo Out's "select existing items" shape, because a
 * vendor consigning goods to you is new stock entering the building for the first time.
 */
export type MemoInStatus = "Open" | "Partially received" | "Received";

export interface MemoInLine {
  id: string;
  description: string;
  category: InventoryCategory;
  expectedQty: number;
  /** The vendor's consignment price basis for this line — what they'll bill per unit if/when sold. Free text, mirrors MemoLine.priceBasis. */
  priceBasis: string;
  receivedQty: number;
  receivedItemIds: string[];
}

export interface MemoInRecord {
  id: string;
  vendorId: string;
  /** Denormalized display name, kept in sync at issue time — mirrors MemoRecord.counterparty. */
  counterparty: string;
  contact: string;
  phone: string;
  /** The vendor's own memo/reference number for this shipment, if they gave one. */
  vendorRef?: string;
  salesperson: string;
  lines: MemoInLine[];
  issuedAt: string;
  dueDate: string;
  status: MemoInStatus;
  notes: string;
}
