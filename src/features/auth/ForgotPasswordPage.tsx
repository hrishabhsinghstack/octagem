import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SITE_INFO } from "@/constants/site.config";
import { useBranding } from "@/contexts/brandingContext";
import { DEMO_OTP, forgotPassword, resetPassword, verifyOtp } from "@/lib/api/authApi";
import { showError, showSuccess } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

const otpSchema = z.object({
  otpCode: z.string().length(6, "Code must be exactly 6 digits"),
});

const passwordSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters long"),
    confirmPassword: z.string().min(6, "Password must be at least 6 characters long"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type EmailFormValues = z.infer<typeof emailSchema>;
type OtpFormValues = z.infer<typeof otpSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

const DEFAULT_TIMER_SECONDS = 60;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { branding, companyName } = useBranding();
  const brandName = companyName || SITE_INFO.name;
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(DEFAULT_TIMER_SECONDS);

  const emailForm = useForm<EmailFormValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });
  const otpForm = useForm<OtpFormValues>({ resolver: zodResolver(otpSchema), defaultValues: { otpCode: "" } });
  const passwordForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema), defaultValues: { newPassword: "", confirmPassword: "" } });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const sendDemoCode = async (targetEmail: string) => {
    await forgotPassword({ email: targetEmail });
    showSuccess("Demo mode", `No real email is sent yet — your verification code is ${DEMO_OTP}.`);
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      await sendDemoCode(email);
      setTimer(DEFAULT_TIMER_SECONDS);
    } catch (error: any) {
      showError("Error", error?.message || "Failed to resend verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const onEmailSubmit = async (values: EmailFormValues) => {
    setIsLoading(true);
    try {
      await sendDemoCode(values.email);
      setEmail(values.email);
      setTimer(DEFAULT_TIMER_SECONDS);
      setStep(2);
    } catch (error: any) {
      showError("Error", error?.message || "Failed to send verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const onOtpSubmit = async (values: OtpFormValues) => {
    setIsLoading(true);
    try {
      await verifyOtp({ email, otpCode: values.otpCode });
      showSuccess("Verified", "Code verified successfully.");
      setStep(3);
    } catch (error: any) {
      showError("Error", error?.message || "Invalid verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    setIsLoading(true);
    try {
      await resetPassword({ email, newPassword: values.newPassword });
      showSuccess("Success", "Password reset successfully.");
      navigate("/login");
    } catch (error: any) {
      showError("Error", error?.message || "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center justify-center">
          {branding.primaryLogo ? (
            <img src={branding.primaryLogo} alt={brandName} className="h-10 w-auto object-contain" />
          ) : (
            <span className="text-2xl font-semibold tracking-tight">{brandName}</span>
          )}
        </div>

        <Card>
          <CardHeader className="space-y-1 mb-2">
            <CardTitle className="text-2xl font-bold text-center">
              {step === 1 && "Reset password"}
              {step === 2 && "Verify email"}
              {step === 3 && "Reset password"}
            </CardTitle>
            <CardDescription className="text-center">
              {step === 1 && "Enter your email to reset your password."}
              {step === 2 && `Enter the 6-digit code sent to ${email}`}
              {step === 3 && "Enter a new password for your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Email</FormLabel>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <FormControl>
                            <Input placeholder="Enter your email" className="pl-9" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Sending…" : "Send verification code"}
                  </Button>
                </form>
              </Form>
            )}

            {step === 2 && (
              <Form {...otpForm}>
                <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                  <FormField
                    control={otpForm.control}
                    name="otpCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium flex flex-row justify-center">Verification code</FormLabel>
                        <div className="flex justify-center">
                          <FormControl>
                            <InputOTP maxLength={6} {...field} pattern={REGEXP_ONLY_DIGITS}>
                              <InputOTPGroup className="gap-2">
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                  <InputOTPSlot key={i} index={i} className="h-10 w-10 text-lg font-semibold rounded-xl border shadow-sm" />
                                ))}
                              </InputOTPGroup>
                            </InputOTP>
                          </FormControl>
                        </div>
                        <div className="text-center">
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="text-center text-sm">
                    {timer > 0 ? (
                      <span className="text-muted-foreground">
                        You can resend the code after <b>{timer} sec</b>
                      </span>
                    ) : (
                      <button type="button" onClick={handleResendOtp} className="text-primary hover:underline font-medium disabled:opacity-50" disabled={isLoading}>
                        Resend code
                      </button>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Verifying…" : "Verify code"}
                  </Button>
                </form>
              </Form>
            )}

            {step === 3 && (
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">New password</FormLabel>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <FormControl>
                            <Input type="password" placeholder="New password" className="pl-9" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Confirm password</FormLabel>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <FormControl>
                            <Input type="password" placeholder="Confirm password" className="pl-9" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Resetting…" : "Reset password"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link to="/login" className="flex items-center text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
