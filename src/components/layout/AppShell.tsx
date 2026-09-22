import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isSettingsPage = location.pathname === "/settings";

  if (isSettingsPage) return <>{children}</>;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <div className="print:hidden contents">
          <AppSidebar />
        </div>
        <main className="flex-1 flex flex-col">
          <div key={location.pathname} className="flex-1">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
