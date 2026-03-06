import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { ChangeRequestBadge } from "~/components/delivery/change-request-badge";
import { formatDate } from "~/lib/format";
import type { ChangeRequest } from "~/types/delivery";
import { CheckCircle, XCircle, Loader2 } from "~/components/ui/icons";


interface ChangeRequestCardProps {
  requests: ChangeRequest[];
  deliveryId: string;
  showActions?: boolean; // GV만 true
}

export function ChangeRequestCard({
  requests,
  deliveryId,
  showActions = false,
}: ChangeRequestCardProps) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">변경요청 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400">변경요청이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          변경요청 내역
          <span className="ml-2 text-sm font-normal text-zinc-500">
            ({requests.length}건)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((req) => (
          <ChangeRequestItem
            key={req.id}
            request={req}
            deliveryId={deliveryId}
            showActions={showActions}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface ChangeRequestItemProps {
  request: ChangeRequest;
  deliveryId: string;
  showActions: boolean;
}

function ChangeRequestItem({
  request,
  deliveryId,
  showActions,
}: ChangeRequestItemProps) {
  const fetcher = useFetcher();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectText, setRejectText] = useState("");
  const prevRef = useRef<{ state: string; action: string | null }>({ state: "idle", action: null });

  const isProcessing = fetcher.state !== "idle";
  const currentAction = (
    fetcher.formData as unknown as FormData | null
  )?.get("_action") as string | null;

  // Toast 피드백 (HIGH-1: idle 전환 시 formData null 문제 수정)
  useEffect(() => {
    if (fetcher.state !== "idle") {
      const act = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;
      if (act) prevRef.current.action = act;
    }
    if (prevRef.current.state !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as { success?: boolean; error?: string } | null;
      const act = prevRef.current.action;
      if (result && act) {
        if (result.error) {
          toast.error(result.error);
        } else if (result.success) {
          if (act === "approve_request") {
            toast.success("변경요청이 승인되었습니다.");
          } else if (act === "reject_request") {
            toast.success("변경요청이 반려되었습니다.");
            setShowRejectForm(false);
            setRejectText("");
          }
        }
      }
    }
    prevRef.current.state = fetcher.state;
  }, [fetcher.state, fetcher.data, fetcher.formData]);

  function handleApprove() {
    fetcher.submit(
      { _action: "approve_request", request_id: request.id },
      { method: "post", action: `/delivery/${deliveryId}` }
    );
  }

  function handleReject() {
    if (!rejectText.trim()) {
      toast.error("반려 사유를 입력해주세요.");
      return;
    }
    fetcher.submit(
      {
        _action: "reject_request",
        request_id: request.id,
        response_text: rejectText,
      },
      { method: "post", action: `/delivery/${deliveryId}` }
    );
  }

  const isPending = request.status === "pending";

  return (
    <div className="rounded-lg border bg-zinc-50 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              요청 날짜: {formatDate(request.requested_date)}
            </span>
            <ChangeRequestBadge status={request.status} />
          </div>
          {request.reason && (
            <p className="text-sm text-zinc-600">{request.reason}</p>
          )}
          <p className="text-xs text-zinc-400">
            {formatDate(request.created_at)}
          </p>
        </div>
      </div>

      {/* 반려 사유 표시 */}
      {request.status === "rejected" && request.response_text && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700">
            <span className="font-medium">반려 사유:</span> {request.response_text}
          </p>
        </div>
      )}

      {/* GV 전용 액션 버튼 (pending 상태일 때만) */}
      {showActions && isPending && (
        <div className="pt-1 space-y-2">
          {!showRejectForm ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={handleApprove}
                disabled={isProcessing}
              >
                {isProcessing && currentAction === "approve_request" ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                승인
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-700 border-red-300 hover:bg-red-50"
                onClick={() => setShowRejectForm(true)}
                disabled={isProcessing}
              >
                <XCircle className="h-3 w-3 mr-1" />
                반려
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-zinc-600">반려 사유 (필수)</Label>
              <Textarea
                value={rejectText}
                onChange={(e) => setRejectText(e.target.value)}
                placeholder="반려 사유를 입력하세요..."
                className="text-sm min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessing}
                >
                  {isProcessing && currentAction === "reject_request" ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : null}
                  반려 확정
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectText("");
                  }}
                  disabled={isProcessing}
                >
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
