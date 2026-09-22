import { useAuth } from "@/contexts/authContext";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
