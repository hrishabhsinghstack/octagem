import * as authApi from "@/lib/api/authApi";
import * as roleStore from "@/lib/store/roleStore";
import type { AuthSession, LoginPayload } from "@/types/auth";
import type { DataScope, PermissionAction, PermissionModule, Role } from "@/types/rbac";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface AuthContextValue {
  session: AuthSession | null;
  role: Role | null;
  login: (payload: LoginPayload) => Promise<AuthSession>;
  logout: () => void;
  /** False whenever no session or the role has no grant for this module+action — deny by default. */
  can: (module: PermissionModule, action: PermissionAction) => boolean;
  /** Null when the role has no grant for this module at all (distinct from a real scope value). */
  scopeFor: (module: PermissionModule) => DataScope | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(() => authApi.getSession());

  const role = useMemo<Role | null>(() => {
    if (!session) return null;
    return roleStore.getById(session.roleId) ?? null;
  }, [session]);

  const login = useCallback(async (payload: LoginPayload) => {
    const result = await authApi.login(payload);
    setSession(result);
    return result;
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setSession(null);
  }, []);

  const can = useCallback(
    (module: PermissionModule, action: PermissionAction) => {
      const permission = role?.permissions.find((p) => p.module === module);
      return permission ? permission.actions.includes(action) : false;
    },
    [role]
  );

  const scopeFor = useCallback(
    (module: PermissionModule): DataScope | null => {
      const permission = role?.permissions.find((p) => p.module === module);
      return permission?.scope ?? null;
    },
    [role]
  );

  const value = useMemo<AuthContextValue>(() => ({ session, role, login, logout, can, scopeFor }), [session, role, login, logout, can, scopeFor]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
};
