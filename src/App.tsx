import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AuthProvider } from "@/contexts/authContext";
import { BrandingProvider } from "@/contexts/brandingContext";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { AppRoutes } from "@/routes/AppRoutes";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppShell>
                    <AppRoutes />
                  </AppShell>
                </RequireAuth>
              }
            />
          </Routes>
          <Toaster richColors position="top-right" />
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
