import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { Loader2, Send } from "~/components/ui/icons";

interface ChangeRequestFormProps {
  deliveryId: string;
  hasPendingRequest: boolean;
}

export function ChangeRequestForm({
  deliveryId,
  hasPendingRequest,
}: ChangeRequestFormProps) {
  const fetcher = useFetcher();
  const [requestedDate, setRequestedDate] = useState("");
  const [reason, setReason] = useState("");
  const prevStateRef = useRef(fetcher.state);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (prevStateRef.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as {
        success?: boolean;
        error?: string;
      } | null;
      if (!result) return;
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success("변경요청이 제출되었습니다. GV International에서 검토합니다.");
        setRequestedDate("");
        setReason("");
      }
    }
    prevStateRef.current = fetcher.state;
  }, [fetcher.state, fetcher.data]);

  // 오늘 날짜 (min date)
  const today = new Date().toISOString().split("T")[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestedDate) {
      toast.error("희망 배송일을 선택해주세요.");
      return;
    }
    fetcher.submit(
      {
        _action: "submit_change_request",
        requested_date: requestedDate,
        reason,
      },
      { method: "post", action: `/saelim/delivery/${deliveryId}` }
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">배송일 변경요청</CardTitle>
      </CardHeader>
      <CardContent>
        {hasPendingRequest ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm text-amber-800 font-medium">대기 중인 변경요청이 있습니다.</p>
            <p className="text-xs text-amber-600 mt-1">
              기존 요청이 처리된 후 새로운 요청을 제출할 수 있습니다.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-zinc-500">
              배송일 변경이 필요한 경우 아래 양식을 작성해 주세요.
              GV International에서 검토 후 처리됩니다.
            </p>

            <div className="space-y-2">
              <Label htmlFor="requested_date" className="text-sm font-medium">
                희망 배송일 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="requested_date"
                type="date"
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                min={today}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium">
                변경 사유{" "}
                <span className="text-zinc-400 font-normal">(선택)</span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="변경 사유를 입력해 주세요..."
                maxLength={500}
                disabled={isSubmitting}
                className="min-h-[80px] resize-none text-sm"
              />
              <p className="text-xs text-zinc-400 text-right">
                {reason.length}/500
              </p>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !requestedDate}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              변경요청 제출
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
