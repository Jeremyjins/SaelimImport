import { Outlet, Link, useFetcher, data, redirect } from "react-router";
import type { Route } from "./+types/_saelim";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { LogOut, ChevronDown, Truck } from "~/components/ui/icons";
import { requireAuth } from "~/lib/auth.server";
import { ORG_TYPES } from "~/lib/constants";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, responseHeaders } = await requireAuth(request, context);

  if (user.app_metadata?.org_type !== ORG_TYPES.SAELIM) {
    throw redirect("/", { headers: responseHeaders });
  }

  return data({ user }, { headers: responseHeaders });
}

export default function SaelimLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const fetcher = useFetcher();

  const displayName = user.email?.split("@")[0] ?? "사용자";
  const avatarInitial = displayName[0]?.toUpperCase() ?? "S";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b bg-white px-8">
        <div className="flex items-center gap-8">
          <span className="text-base font-bold text-zinc-900">
            세림 수입관리
          </span>
          <div className="h-5 w-px bg-zinc-200" />
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/saelim/delivery" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                배송관리
              </Link>
            </Button>
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{displayName}</span>
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-xs text-zinc-500">{user.email}</div>
            <DropdownMenuSeparator />
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
      </header>

      <main className="flex-1 bg-zinc-50">
        <Outlet />
      </main>
    </div>
  );
}
