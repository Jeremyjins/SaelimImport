import { useLoaderData, Link } from "react-router";
import { PageContainer } from "~/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ChevronLeft, Package, Ship } from "~/components/ui/icons";
import { DeliveryStatusBadge } from "~/components/delivery/change-request-badge";
import { ChangeRequestBadge } from "~/components/delivery/change-request-badge";
import { ChangeRequestForm } from "~/components/delivery/change-request-form";
import { formatDate } from "~/lib/format";
import { loader, action } from "~/loaders/saelim.delivery.$id.server";
import type { SaelimDeliveryDetail } from "~/types/delivery";
import type { Route } from "./+types/_saelim.delivery.$id";

export { loader, action };

export function meta(_args: Route.MetaArgs) {
  return [{ title: "배송 상세 | 세림 수입관리" }];
}

interface LoaderData {
  delivery: SaelimDeliveryDetail;
}

export default function SaelimDeliveryDetailPage() {
  const { delivery } =
    useLoaderData<typeof loader>() as unknown as LoaderData;

  const pageTitle = delivery.pi?.pi_no
    ? `배송 - ${delivery.pi.pi_no}`
    : "배송 상세";

  const hasPendingRequest = delivery.my_change_requests.some(
    (r) => r.status === "pending"
  );

  return (
    <PageContainer>
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* 페이지 헤더 */}
        <div>
          <Link
            to="/saelim/delivery"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-3"
          >
            <ChevronLeft className="h-4 w-4" />
            배송 현황
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-zinc-900">{pageTitle}</h1>
            <DeliveryStatusBadge status={delivery.status} />
          </div>
        </div>

        {/* 배송 정보 (읽기 전용) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">배송 정보</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Package className="h-4 w-4" />
                <span>PI번호</span>
              </div>
              <span className="text-sm font-medium">
                {delivery.pi?.pi_no ?? (
                  <span className="text-zinc-300">미연결</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Ship className="h-4 w-4" />
                <span>CI번호</span>
              </div>
              <span className="text-sm font-medium">
                {delivery.shipping?.ci_no ?? (
                  <span className="text-zinc-300">미연결</span>
                )}
              </span>
            </div>

            {delivery.shipping && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">선박 / ETA</span>
                <span className="text-sm">
                  {delivery.shipping.vessel ?? "-"}
                  {delivery.shipping.eta && (
                    <span className="text-zinc-500 ml-1">
                      ({formatDate(delivery.shipping.eta)})
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">배송일</span>
              <span className="text-sm font-semibold">
                {delivery.delivery_date
                  ? formatDate(delivery.delivery_date)
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 변경요청 폼 (delivered 상태가 아닐 때만) */}
        {delivery.status !== "delivered" && (
          <ChangeRequestForm
            deliveryId={delivery.id}
            hasPendingRequest={hasPendingRequest}
          />
        )}

        {/* 내 변경요청 내역 */}
        {delivery.my_change_requests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                내 변경요청 내역
                <span className="ml-2 text-sm font-normal text-zinc-500">
                  ({delivery.my_change_requests.length}건)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {delivery.my_change_requests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border bg-zinc-50 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      희망 배송일: {formatDate(req.requested_date)}
                    </span>
                    <ChangeRequestBadge status={req.status} />
                  </div>
                  {req.reason && (
                    <p className="text-sm text-zinc-600">{req.reason}</p>
                  )}
                  {req.status === "rejected" && req.response_text && (
                    <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
                      <p className="text-xs text-red-700">
                        <span className="font-medium">거부 사유:</span>{" "}
                        {req.response_text}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-zinc-500">
                    요청일: {formatDate(req.created_at)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
