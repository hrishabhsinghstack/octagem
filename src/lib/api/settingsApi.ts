import type { BusinessProfile, UserProfile, WorkflowSettings } from "@/types/settings";

/**
 * localStorage-backed for now — no backend exists yet (OCTAGEM-BLUEPRINT.md §38). Function
 * signatures are async and return-a-copy so a real API layer can replace the bodies without
 * changing any caller.
 */
const PROFILE_KEY = "octagem.profile.local";
const BUSINESS_KEY = "octagem.business.local";
const WORKFLOW_KEY = "octagem.workflow.local";

const DEFAULT_PROFILE: UserProfile = { firstName: "Jordan", lastName: "Miller", email: "jordan@octagem.demo", phone: "" };
const DEFAULT_BUSINESS: BusinessProfile = {
  companyName: "OctaGem Demo Co.",
  businessType: "Diamond & Jewelry Wholesale",
  address: "36 West 47th Street, Suite 1001",
  city: "New York",
  state: "NY",
  zipCode: "10036",
  currency: "USD",
};

export async function getUserProfile(): Promise<UserProfile> {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function updateUserProfile(profile: UserProfile): Promise<UserProfile> {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function getBusinessProfile(): Promise<BusinessProfile> {
  try {
    const raw = localStorage.getItem(BUSINESS_KEY);
    return raw ? { ...DEFAULT_BUSINESS, ...JSON.parse(raw) } : DEFAULT_BUSINESS;
  } catch {
    return DEFAULT_BUSINESS;
  }
}

export async function updateBusinessProfile(profile: BusinessProfile): Promise<BusinessProfile> {
  localStorage.setItem(BUSINESS_KEY, JSON.stringify(profile));
  return profile;
}

const DEFAULT_WORKFLOW: WorkflowSettings = {};

export async function getWorkflowSettings(): Promise<WorkflowSettings> {
  try {
    const raw = localStorage.getItem(WORKFLOW_KEY);
    return raw ? { ...DEFAULT_WORKFLOW, ...JSON.parse(raw) } : DEFAULT_WORKFLOW;
  } catch {
    return DEFAULT_WORKFLOW;
  }
}

export async function updateWorkflowSettings(settings: WorkflowSettings): Promise<WorkflowSettings> {
  localStorage.setItem(WORKFLOW_KEY, JSON.stringify(settings));
  return settings;
}
