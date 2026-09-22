/**
 * Vendor and Customer share this shape (OCTAGEM-BLUEPRINT.md §11.3/§14.3 both describe a
 * "party record"). Kept as two distinct types rather than one with a role flag, because their
 * detail pages and list filters genuinely differ (credit limit/salesperson only make sense for
 * a customer; a vendor doesn't need one) — but the field overlap is intentional and mirrors the
 * blueprint's shared-party concept.
 */
export type CustomerType = "Individual" | "Retailer" | "Wholesaler" | "Other";

export interface Vendor {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  currency: string;
  notes: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  type: CustomerType;
  contact: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  creditLimit?: number;
  salesperson?: string;
  /** Preferred transaction currency (an ISO code from the "currencies" master list). Defaults to the tenant's base currency when unset. */
  currency?: string;
  /** Default tax rate (a "taxRates" master list entry id) — e.g. a resale-certificate holder defaults to an Exempt rate. */
  taxRateId?: string;
  notes: string;
  createdAt: string;
}
