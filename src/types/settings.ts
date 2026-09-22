export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface BusinessProfile {
  companyName: string;
  businessType: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  currency: string;
}

/**
 * Tenant-configurable process toggles — grows over time as more workflow steps become optional
 * per business (OCTAGEM-BLUEPRINT.md §5 design principle: "configuration over code for market
 * variation"). Kept as one small object so new toggles are additive, not a new settings screen each time.
 */
export interface WorkflowSettings {
  /** On (default): the Quotes module is visible and usable. Off: Quotes disappears from the app entirely — for businesses that don't quote. */
  quoteModuleEnabled: boolean;
  /** Off (default): Sales Orders can be created directly. On: the primary path goes Quote → Accept → Sales Order. Meaningless (and forced off) when quoteModuleEnabled is off. */
  requireQuoteBeforeSalesOrder: boolean;
}
