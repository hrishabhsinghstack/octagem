import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { settingsMenuItems } from "@/constants/settings";
import { useAuth } from "@/contexts/authContext";
import { ArrowLeft } from "lucide-react";

interface SettingsSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onExit: () => void;
}

export function SettingsSidebar({ activeTab, onTabChange, onExit }: SettingsSidebarProps) {
  const { can } = useAuth();
  const visibleItems = settingsMenuItems.filter((item) => !item.module || can(item.module, "view"));

  return (
    <Sidebar collapsible="none" className="w-64 border-r">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Exit
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="p-2">
          {visibleItems.map((item) => (
            <SidebarMenuItem key={item.value}>
              <SidebarMenuButton isActive={activeTab === item.value} onClick={() => onTabChange(item.value)} className="w-full justify-start">
                <item.icon className="w-4 h-4 mr-3" />
                {item.title}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
