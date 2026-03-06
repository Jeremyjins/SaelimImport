import { Link, useLocation, useFetcher } from "react-router";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "~/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
  Home,
  ShoppingCart,
  FileText,
  Ship,
  Package,
  Landmark,
  Truck,
  Building2,
  Box,
  Users,
  Settings,
  LogOut,
  ChevronDown,
} from "~/components/ui/icons";

const navItems = [
  { title: "대시보드", url: "/", icon: Home },
  { title: "구매주문", url: "/po", icon: ShoppingCart },
  { title: "견적서", url: "/pi", icon: FileText },
  { title: "선적서류", url: "/shipping", icon: Ship },
  { title: "오더관리", url: "/orders", icon: Package },
  { title: "통관관리", url: "/customs", icon: Landmark },
  { title: "배송관리", url: "/delivery", icon: Truck },
];

const settingsItems = [
  { title: "거래처", url: "/settings/organizations", icon: Building2 },
  { title: "제품", url: "/settings/products", icon: Box },
  { title: "사용자", url: "/settings/users", icon: Users },
];

interface AppSidebarProps {
  user: { email?: string; app_metadata?: Record<string, unknown> };
}

export function AppSidebar({ user }: AppSidebarProps) {
  const location = useLocation();
  const fetcher = useFetcher();

  const displayName = user.email?.split("@")[0] ?? "사용자";
  const avatarInitial = displayName[0]?.toUpperCase() ?? "U";

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sidebar-foreground">
              GV International
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              수입관리 시스템
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.url === "/"
                        ? location.pathname === "/"
                        : location.pathname === item.url || location.pathname.startsWith(item.url + "/")
                    }
                  >
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="w-full">
                <Settings className="mr-1 h-3.5 w-3.5" />
                설정
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {settingsItems.map((item) => (
                    <SidebarMenuSub key={item.url}>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={location.pathname === item.url || location.pathname.startsWith(item.url + "/")}
                        >
                          <Link to={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-auto py-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">{displayName}</span>
                    <span className="text-xs text-sidebar-foreground/60">
                      {user.email}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-popper-anchor-width]"
              >
                <DropdownMenuItem asChild>
                  <fetcher.Form method="post" action="/logout">
                    <button type="submit" className="flex w-full items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      로그아웃
                    </button>
                  </fetcher.Form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
