import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.home";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { StatCard } from "~/components/dashboard/stat-card";
import { AlertList } from "~/components/dashboard/alert-list";
import { RecentActivity } from "~/components/dashboard/recent-activity";
import {
  FileText,
  FileDown,
  Ship,
  Package,
  AlertCircle,
  Truck,
} from "~/components/ui/icons";
import { loader } from "~/loaders/home.server";

export { loader };

export function meta(_args: Route.MetaArgs) {
  return [{ title: "대시보드 | GV International" }];
}

export default function HomePage() {
  const { stats, recentOrders, pendingRequests, cyRiskCount } =
    useLoaderData<typeof loader>() as unknown as {
      stats: {
        poProcess: number;
        piProcess: number;
        shippingProcess: number;
        orderProcess: number;
        customsNotReceived: number;
        deliveryActive: number;
      };
      recentOrders: Array<{
        id: string;
        saelim_no: string | null;
        status: string;
        created_at: string | null;
      }>;
      pendingRequests: Array<{
        id: string;
        delivery_id: string;
        requested_date: string;
        reason: string | null;
        created_at: string | null;
      }>;
      cyRiskCount: number;
    };

  const alertItems = [
    {
      id: "cy-risk",
      label: "CY 체류일 초과 위험",
      count: cyRiskCount,
      to: "/orders",
      variant: "red" as const,
    },
    {
      id: "delivery-requests",
      label: "배송 변경요청 대기",
      count: pendingRequests.length,
      to: "/delivery",
      variant: "amber" as const,
    },
    {
      id: "customs-fee",
      label: "통관비 미수령",
      count: stats.customsNotReceived,
      to: "/customs",
      variant: "orange" as const,
    },
  ];

  return (
    <>
      <Header title="대시보드" />
      <PageContainer>
        {/* Stat Cards — 2 cols on mobile, 3 cols on md, 6 cols on xl */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            label="진행중 PO"
            count={stats.poProcess}
            icon={FileText}
            to="/po"
          />
          <StatCard
            label="진행중 PI"
            count={stats.piProcess}
            icon={FileDown}
            to="/pi"
          />
          <StatCard
            label="진행중 선적"
            count={stats.shippingProcess}
            icon={Ship}
            to="/shipping"
          />
          <StatCard
            label="진행중 오더"
            count={stats.orderProcess}
            icon={Package}
            to="/orders"
          />
          <StatCard
            label="통관비 미수령"
            count={stats.customsNotReceived}
            icon={AlertCircle}
            to="/customs"
            variant="warning"
          />
          <StatCard
            label="대기 배송"
            count={stats.deliveryActive}
            icon={Truck}
            to="/delivery"
            variant="info"
          />
        </div>

        {/* Alert + Recent Activity — stacked on mobile, side by side on md */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AlertList items={alertItems} />
          <RecentActivity orders={recentOrders} />
        </div>
      </PageContainer>
    </>
  );
}
