import * as store from "@/lib/store/authStore";
import type { AuthSession, ForgotPasswordPayload, LoginPayload, ResetPasswordPayload, VerifyOtpPayload } from "@/types/auth";

/** No real email delivery yet — every forgot-password flow uses this fixed code, shown to the user via a toast instead of actually sending anything. */
export const DEMO_OTP = "123456";

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const user = store.findUserByEmail(payload.usernameOrEmail);
  if (!user || user.password !== payload.password) {
    throw new Error("Incorrect email or password.");
  }
  if (!user.active) {
    throw new Error("This account has been deactivated. Contact your Company Admin.");
  }
  const session: AuthSession = { token: `demo-${Date.now()}`, userId: user.id, roleId: user.roleId, name: user.name, email: user.email };
  store.setSession(session);
  return session;
}

export function logout() {
  store.clearSession();
}

export function getSession(): AuthSession | null {
  return store.getSession();
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
  const user = store.findUserByEmail(payload.email);
  if (!user) throw new Error("No account found with that email.");
}

export async function verifyOtp(payload: VerifyOtpPayload): Promise<void> {
  if (payload.otpCode !== DEMO_OTP) throw new Error("Incorrect verification code.");
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  store.setPassword(payload.email, payload.newPassword);
}
