import * as userStore from "@/lib/store/userStore";
import type { AuthSession } from "@/types/auth";

const SESSION_KEY = "octagem.session.local";

export function findUserByEmail(usernameOrEmail: string) {
  return userStore.findByEmail(usernameOrEmail);
}

export function setPassword(email: string, newPassword: string) {
  const user = userStore.findByEmail(email);
  if (user) userStore.update(user.id, { password: newPassword });
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AuthSession>;
    // A session saved before roles existed (no userId/roleId) is stale — treat it as signed out rather than resolving to a role-less, permission-less state.
    if (!session.userId || !session.roleId) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
