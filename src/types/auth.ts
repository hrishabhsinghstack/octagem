export interface LoginPayload {
  usernameOrEmail: string;
  password: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  roleId: string;
  name: string;
  email: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface VerifyOtpPayload {
  email: string;
  otpCode: string;
}

export interface ResetPasswordPayload {
  email: string;
  newPassword: string;
}
