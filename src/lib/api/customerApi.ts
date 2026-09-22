import * as store from "@/lib/store/customerStore";
import type { Customer } from "@/types/party";

export async function listCustomers(): Promise<Customer[]> {
  return [...store.getAll()];
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  return store.getById(id);
}

export type CustomerPayload = Omit<Customer, "id" | "createdAt">;

export async function createCustomer(payload: CustomerPayload): Promise<Customer> {
  const customer: Customer = { ...payload, id: store.nextCustomerId(), createdAt: new Date().toISOString().slice(0, 10) };
  return store.insert(customer);
}

export async function updateCustomer(id: string, payload: CustomerPayload): Promise<Customer | undefined> {
  return store.update(id, payload);
}

export async function deleteCustomer(id: string): Promise<void> {
  store.remove(id);
}
