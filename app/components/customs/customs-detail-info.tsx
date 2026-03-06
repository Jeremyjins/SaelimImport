import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ToggleLeft, ToggleRight, Loader2 } from "~/components/ui/icons";
import { formatDate } from "~/lib/format";
import type { CustomsDetail } from "~/types/customs";

interface CustomsDetailInfoProps {
  customs: CustomsDetail;
  optimisticFeeReceived: boolean;
  isTogglingFee: boolean;
  onToggleFee: () => void;
}

export function CustomsDetailInfo({
  customs,
  optimisticFeeReceived,
  isTogglingFee,
  onToggleFee,
}: CustomsDetailInfoProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">기본 정보</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-zinc-500 mb-1">통관번호</dt>
            <dd className="font-medium">{customs.customs_no ?? "—"}</dd>
          </div>

          <div>
            <dt className="text-xs text-zinc-500 mb-1">통관일</dt>
            <dd className="font-medium">
              {customs.customs_date ? formatDate(customs.customs_date) : "—"}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-zinc-500 mb-1">선적서류</dt>
            <dd>
              {customs.shipping ? (
                <Link
                  to={`/shipping/${customs.shipping.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {customs.shipping.ci_no}
                  {customs.shipping.vessel
                    ? ` (${customs.shipping.vessel})`
                    : ""}
                </Link>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-zinc-500 mb-1">비용수령</dt>
            <dd>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 gap-1.5 font-normal"
                disabled={isTogglingFee}
                onClick={onToggleFee}
              >
                {isTogglingFee ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                ) : optimisticFeeReceived ? (
                  <ToggleRight className="h-5 w-5 text-green-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-zinc-400" />
                )}
                <span
                  className={
                    optimisticFeeReceived ? "text-green-700" : "text-zinc-500"
                  }
                >
                  {optimisticFeeReceived ? "수령완료" : "미수령"}
                </span>
              </Button>
            </dd>
          </div>
        </dl>

        {/* 선적서류 부가 정보 */}
        {customs.shipping && (
          <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {customs.shipping.pi && (
              <div>
                <dt className="text-xs text-zinc-500 mb-1">PI 번호</dt>
                <dd className="font-medium">{customs.shipping.pi.pi_no}</dd>
              </div>
            )}
            {customs.shipping.vessel && (
              <div>
                <dt className="text-xs text-zinc-500 mb-1">선박</dt>
                <dd className="font-medium">{customs.shipping.vessel}</dd>
              </div>
            )}
            {customs.shipping.eta && (
              <div>
                <dt className="text-xs text-zinc-500 mb-1">ETA</dt>
                <dd className="font-medium">
                  {formatDate(customs.shipping.eta)}
                </dd>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
