import { navGroups, type NavItem } from "@/constants/nav";
import { SITE_INFO } from "@/constants/site.config";
import { useAuth } from "@/contexts/authContext";
import { useBranding } from "@/contexts/brandingContext";
import { getWorkflowSettings } from "@/lib/api/settingsApi";
import type { WorkflowSettings } from "@/types/settings";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ChevronLeft, ChevronRight, LogOut, Settings, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

function SideBarItem({ item }: { item: NavItem }) {
  const location = useLocation();
  const { state } = useSidebar();
  const isActive = location.pathname === item.url || (item.url !== "/" && location.pathname.startsWith(`${item.url}/`));

  const button = (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={item.url}>
          <item.icon className="w-4 h-4" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  if (state !== "collapsed") return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  );
}

/** Renders the uploaded brand mark/logo, or a styled text wordmark when none has been set. */
function BrandHeader({ collapsed }: { collapsed: boolean }) {
  const { branding, companyName } = useBranding();
  const brandName = companyName || SITE_INFO.name;

  if (collapsed) {
    if (branding.brandMark) return <img src={branding.brandMark} alt={brandName} className="w-7 h-7 object-contain" />;
    return <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">{brandName.slice(0, 2).toUpperCase()}</span>;
  }

  if (branding.primaryLogo) return <img src={branding.primaryLogo} alt={brandName} className="h-8 w-auto object-contain" />;
  return <span className="text-lg font-semibold tracking-tight">{brandName}</span>;
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const { session, logout, can } = useAuth();
  const isCollapsed = state === "collapsed";

  const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings | null>(null);
  useEffect(() => {
    getWorkflowSettings().then(setWorkflowSettings);
  }, []);

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      children: group.children.filter((item) => {
        if (item.module && !can(item.module, "view")) return false;
        if (item.workflowCheck && (!workflowSettings || !item.workflowCheck(workflowSettings))) return false;
        return true;
      }),
    }))
    .filter((group) => group.children.length > 0);

  const userName = session?.name ?? "Signed-out user";
  const userEmail = session?.email ?? "";
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute bottom-20 -right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent transition-colors"
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      <SidebarHeader className="px-2 py-1 h-[65px] border-b">
        <Link to="/" className={`flex items-center w-full h-full ${isCollapsed ? "justify-center" : "px-2"}`}>
          <BrandHeader collapsed={isCollapsed} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="flex flex-col gap-0 px-2 group-data-[collapsible=icon]:!px-0">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel className="text-muted-foreground">
              {isCollapsed ? group.title.split(" ").map((w) => w[0]).join("") : group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.children.map((item) => (
                  <SideBarItem key={item.title} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={`w-full h-auto py-2 flex items-center gap-2 ${isCollapsed ? "justify-center px-0" : "justify-start px-2"}`}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src="" alt={userName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex flex-col items-start overflow-hidden text-left">
                  <span className="text-sm font-medium truncate w-full">{userName}</span>
                  <span className="text-xs text-muted-foreground truncate w-full">{userEmail}</span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" side="top">
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-1 leading-none">
                <p className="font-medium">{userName}</p>
                <p className="w-[200px] truncate text-sm text-muted-foreground">{userEmail}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
