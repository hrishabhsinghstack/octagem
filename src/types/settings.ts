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
 *
 * Currently carries no toggles: the two that lived here gated Quotes and Sales Orders, and those
 * documents were removed — the sales chain is Memo → Invoice, with a direct invoice as the other way
 * in. The type, its Settings panel and RequireWorkflowSetting are kept on purpose: they are the seam
 * the next toggle drops into. Typed as a Record rather than an empty interface so it stays assignable
 * and lint-clean while empty.
 */
export type WorkflowSettings = Record<string, never>;
