import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { useMemo } from "react";
import { PageContainer } from "~/components/layout/page-container";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DeliveryStatusBadge } from "~/components/delivery/change-request-badge";
import { formatDate } from "~/lib/format";
import { loader } from "~/loaders/saelim.delivery.server";
import { ErrorBanner } from "~/components/shared/error-banner";
import type { SaelimDeliveryListItem } from "~/types/delivery";
import type { Route } from "./+types/_saelim.delivery";

export { loader };

export function meta(_args: Route.MetaArgs) {
  return [{ title: "배송 현황 | 세림 수입관리" }];
}

interface LoaderData {
  deliveries: SaelimDeliveryListItem[];
  error: string | null;
}

export default function SaelimDeliveryPage() {
  const rawData = useLoaderData<typeof loader>() as unknown as LoaderData;
  const { deliveries, error: loaderError } = rawData;

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const statusFilter = searchParams.get("status") ?? "all";

  const filtered = useMemo(
    () =>
      deliveries.filter((d) => {
        if (statusFilter === "active") {
          return d.status === "pending" || d.status === "scheduled";
        }
        if (statusFilter === "delivered") {
          return d.status === "delivered";
        }
        return true;
      }),
    [deliveries, statusFilter]
  );

  const counts = useMemo(() => {
    const result = { all: deliveries.length, active: 0, delivered: 0 };
    for (const d of deliveries) {
      if (d.status === "pending" || d.status === "scheduled") result.active++;
      else if (d.status === "delivered") result.delivered++;
    }
    return result;
  }, [deliveries]);

  function handleTabChange(value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") newParams.delete("status");
    else newParams.set("status", value);
    setSearchParams(newParams, { replace: true });
  }

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-zinc-900">배송 현황</h1>

        {loaderError && <ErrorBanner message={loaderError} />}

        {/* 상태 필터 */}
        <Tabs value={statusFilter} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all">전체 ({counts.all})</TabsTrigger>
            <TabsTrigger value="active">진행 ({counts.active})</TabsTrigger>
            <TabsTrigger value="delivered">
              완료 ({counts.delivered})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 배송 카드 목록 */}
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-400 text-sm">
              배송 내역이 없습니다.
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                className="block w-full text-left rounded-lg border bg-white p-4 hover:bg-zinc-50 transition-colors"
                onClick={() => navigate(`/saelim/delivery/${d.id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-base">
                    {d.pi?.pi_no ?? (
                      <span className="text-zinc-400">PI 미연결</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {d.my_pending_request && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">
                        변경요청 대기
                      </Badge>
                    )}
                    <DeliveryStatusBadge status={d.status} />
                  </div>
                </div>
                <div className="text-sm text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                  {d.shipping?.ci_no && (
                    <span>CI: {d.shipping.ci_no}</span>
                  )}
                  {d.shipping?.vessel && <span>{d.shipping.vessel}</span>}
                  {d.shipping?.eta && (
                    <span>ETA: {formatDate(d.shipping.eta)}</span>
                  )}
                  {d.delivery_date && (
                    <span className="font-medium text-zinc-700">
                      배송일: {formatDate(d.delivery_date)}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </PageContainer>
  );
}
