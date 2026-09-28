import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { BusinessSettings } from "@/components/settings/BusinessSettings";
import { InventoryCatalogSettings } from "@/components/settings/catalog/InventoryCatalogSettings";
import { MasterDataSettings } from "@/components/settings/MasterDataSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { RolesSettings } from "@/components/settings/rbac/RolesSettings";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { UsersSettings } from "@/components/settings/UsersSettings";
import { WorkflowSettings } from "@/components/settings/WorkflowSettings";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");

  const renderContent = () => {
    switch (activeTab) {
      case "business":
        return <BusinessSettings />;
      case "branding":
        return <BrandingSettings />;
      case "masterData":
        return <MasterDataSettings />;
      case "catalog":
        return <InventoryCatalogSettings />;
      case "workflow":
        return <WorkflowSettings />;
      case "users":
        return <UsersSettings />;
      case "roles":
        return <RolesSettings />;
      default:
        return <ProfileSettings />;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <SidebarProvider>
        <div className="flex">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} onExit={() => navigate("/")} />
          <main className="flex-1 p-6 max-w-6xl">{renderContent()}</main>
        </div>
      </SidebarProvider>
    </div>
  );
}
