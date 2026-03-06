import { Outlet, data } from "react-router";
import type { Route } from "./+types/_layout";
import { SidebarProvider, SidebarInset } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/layout/app-sidebar";
import { requireGVUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, responseHeaders } = await requireGVUser(request, context);
  return data({ user }, { headers: responseHeaders });
}

export default function GVLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
