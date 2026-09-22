import * as store from "@/lib/store/vendorStore";
import type { Vendor } from "@/types/party";

export async function listVendors(): Promise<Vendor[]> {
  return [...store.getAll()];
}

export async function getVendor(id: string): Promise<Vendor | undefined> {
  return store.getById(id);
}

export type VendorPayload = Omit<Vendor, "id" | "createdAt">;

export async function createVendor(payload: VendorPayload): Promise<Vendor> {
  const vendor: Vendor = { ...payload, id: store.nextVendorId(), createdAt: new Date().toISOString().slice(0, 10) };
  return store.insert(vendor);
}

export async function updateVendor(id: string, payload: VendorPayload): Promise<Vendor | undefined> {
  return store.update(id, payload);
}

export async function deleteVendor(id: string): Promise<void> {
  store.remove(id);
}
