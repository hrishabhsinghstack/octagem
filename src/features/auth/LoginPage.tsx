import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SITE_INFO } from "@/constants/site.config";
import { useAuth } from "@/contexts/authContext";
import { useBranding } from "@/contexts/brandingContext";
import { showError, showSuccess } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

const loginFormSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or email is required"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { branding, companyName } = useBranding();
  const brandName = companyName || SITE_INFO.name;

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { usernameOrEmail: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      await login({ usernameOrEmail: values.usernameOrEmail.trim().toLowerCase(), password: values.password });
      showSuccess("Welcome back", "Signed in successfully.");
      navigate("/");
    } catch (error: any) {
      showError("Login failed", error?.message || "Please try again.");
    } finally {
      setIsSubmitting(false);
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
                <CardDescription className="text-center">Enter your email and password to access your account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="usernameOrEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Email</FormLabel>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <FormControl>
                          <Input placeholder="you@company.com" className="pl-9" {...field} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Password</FormLabel>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <FormControl>
                          <Input placeholder="Enter your password" type={showPassword ? "text" : "password"} className="pl-9 pr-9" {...field} />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-end">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-3">
                <Button type="submit" className="w-full" loading={isSubmitting}>
                  {isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">Demo account: jordan@octagem.demo / octagem123</p>
              </CardFooter>
            </Card>
          </form>
        </Form>
      </div>
    </div>
  );
}
