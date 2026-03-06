import { useState, useRef, useEffect } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { DeliveryStatusBadge } from "~/components/delivery/change-request-badge";
import { formatDate } from "~/lib/format";
import type { DeliveryDetail } from "~/types/delivery";
import {
  Pencil,
  Check,
  X,
  Loader2,
  ExternalLink,
  Package,
  Ship,
} from "~/components/ui/icons";

interface DeliveryInfoCardProps {
  delivery: DeliveryDetail;
}

export function DeliveryInfoCard({ delivery }: DeliveryInfoCardProps) {
  const fetcher = useFetcher();
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(delivery.delivery_date ?? "");
  const prevStateRef = useRef(fetcher.state);

  const isUpdating =
    fetcher.state !== "idle" &&
    (fetcher.formData as unknown as FormData | null)?.get("_action") ===
      "update_delivery_date";

  useEffect(() => {
    if (prevStateRef.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as {
        success?: boolean;
        error?: string;
      } | null;
      const act = (
        fetcher.formData as unknown as FormData | null
      )?.get("_action") as string | null;

      if (!result || !act) return;
      if (result.error) {
        toast.error(result.error);
      } else if (result.success && act === "update_delivery_date") {
        toast.success("배송일이 저장되었습니다.");
        setEditingDate(false);
      }
    }
    prevStateRef.current = fetcher.state;
  }, [fetcher.state, fetcher.data, fetcher.formData]);

  function handleSaveDate() {
    fetcher.submit(
      { _action: "update_delivery_date", delivery_date: dateValue },
      { method: "post" }
    );
  }

  function handleCancelDate() {
    setDateValue(delivery.delivery_date ?? "");
    setEditingDate(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>배송 정보</span>
          <DeliveryStatusBadge status={delivery.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PI 링크 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Package className="h-4 w-4" />
            <span>PI번호</span>
          </div>
          {delivery.pi ? (
            <Link
              to={`/pi/${delivery.pi.id}`}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              {delivery.pi.pi_no}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="text-sm text-zinc-300">미연결</span>
          )}
        </div>

        {/* Shipping 링크 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Ship className="h-4 w-4" />
            <span>CI번호</span>
          </div>
          {delivery.shipping ? (
            <Link
              to={`/shipping/${delivery.shipping.id}`}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              {delivery.shipping.ci_no}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="text-sm text-zinc-300">미연결</span>
          )}
        </div>

        {/* 선박명 / 항차 */}
        {delivery.shipping && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">선박 / ETA</span>
            <span className="text-sm">
              {delivery.shipping.vessel ?? "-"}
              {delivery.shipping.eta && (
                <span className="text-zinc-400 ml-1">
                  ({formatDate(delivery.shipping.eta)})
                </span>
              )}
            </span>
          </div>
        )}

        {/* 배송일 인라인 편집 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">배송일</span>
          {editingDate ? (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="h-7 text-sm w-36"
                disabled={isUpdating}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={handleSaveDate}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 text-green-600" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={handleCancelDate}
                disabled={isUpdating}
              >
                <X className="h-3 w-3 text-zinc-400" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium">
                {delivery.delivery_date
                  ? formatDate(delivery.delivery_date)
                  : "-"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => {
                  setDateValue(delivery.delivery_date ?? "");
                  setEditingDate(true);
                }}
              >
                <Pencil className="h-3 w-3 text-zinc-400" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
