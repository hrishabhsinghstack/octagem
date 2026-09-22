import { useAuth } from "@/contexts/authContext";
import type { PermissionAction, PermissionModule } from "@/types/rbac";
import type { ReactNode } from "react";

interface CanProps {
  module: PermissionModule;
  action: PermissionAction;
  children: ReactNode;
  /** Rendered instead when denied — omit to render nothing. */
  fallback?: ReactNode;
}

/** Conditionally renders based on the signed-in user's role — `<Can module="inventory" action="create"><Button>...</Button></Can>`. */
export function Can({ module, action, children, fallback = null }: CanProps) {
  const { can } = useAuth();
  return <>{can(module, action) ? children : fallback}</>;
}
