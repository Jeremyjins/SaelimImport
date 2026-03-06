import { Outlet, data, isRouteErrorResponse, useRouteError, useNavigation } from "react-router";
import type { Route } from "./+types/_layout";
import { SidebarProvider, SidebarInset } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/layout/app-sidebar";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { requireGVUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, responseHeaders } = await requireGVUser(request, context);
  return data({ user }, { headers: responseHeaders });
}

export default function GVLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const navigation = useNavigation();

  return (
    <SidebarProvider>
      {navigation.state === "loading" && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary animate-pulse" />
      )}
      <AppSidebar user={user} />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <SidebarProvider>
      <AppSidebar user={{ email: "unknown" }} />
      <SidebarInset>
        <Header title="오류가 발생했습니다" backTo="/" />
        <PageContainer>
          {isRouteErrorResponse(error) ? (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">{error.status} {error.statusText}</p>
              {error.data && <p className="mt-1">{String(error.data)}</p>}
            </div>
          ) : (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">예상치 못한 오류가 발생했습니다</p>
              <p className="mt-1">페이지를 새로고침하거나 좌측 메뉴에서 다른 항목을 선택해 주세요.</p>
            </div>
          )}
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
  );
}
