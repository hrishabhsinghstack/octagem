import { useAuth } from "@/contexts/authContext";
import { showError } from "@/lib/utils";
import type { PermissionModule } from "@/types/rbac";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate } from "react-router-dom";

/** Route-level guard — redirects to the Dashboard with a toast when the signed-in role can't view this module, so a direct URL visit can't bypass a hidden nav link. */
export function RequirePermission({ module, children }: { module: PermissionModule; children: ReactNode }) {
  const { can } = useAuth();
  const allowed = can(module, "view");

  useEffect(() => {
    if (!allowed) showError("Not authorized", "Your role doesn't have access to this section.");
  }, [allowed]);

  if (!allowed) return <Navigate to="/" replace />;

  return <>{children}</>;
}
