import { getWorkflowSettings } from "@/lib/api/settingsApi";
import { showError } from "@/lib/utils";
import type { WorkflowSettings } from "@/types/settings";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

/**
 * Route-level guard for tenant-toggleable modules (Settings → Workflow), a sibling to
 * RequirePermission.tsx's role-based guard — redirects with a toast when a module a business has
 * turned off is visited directly by URL, same reasoning as hiding it from the sidebar isn't enough
 * on its own. Takes a predicate rather than a fixed key so it can cover future toggles beyond Quotes.
 */
export function RequireWorkflowSetting({ check, children }: { check: (settings: WorkflowSettings) => boolean; children: ReactNode }) {
  const [settings, setSettings] = useState<WorkflowSettings | null>(null);

  useEffect(() => {
    getWorkflowSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (settings && !check(settings)) showError("Not available", "This module has been disabled for your company.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  if (!settings) return null;
  if (!check(settings)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
