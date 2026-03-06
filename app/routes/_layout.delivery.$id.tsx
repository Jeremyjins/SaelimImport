import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import type { Route } from "./+types/_layout.delivery.$id";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, CheckCircle2, Loader2 } from "~/components/ui/icons";
import { DeliveryInfoCard } from "~/components/delivery/delivery-info-card";
import { ChangeRequestCard } from "~/components/delivery/change-request-card";
import { ContentSection } from "~/components/content/content-section";
import { formatDate } from "~/lib/format";
import { toast } from "sonner";
import type { DeliveryDetail } from "~/types/delivery";
import type { ContentItem } from "~/types/content";
import { loader, action } from "~/loaders/delivery.$id.server";

export { loader, action };

export function meta(_args: Route.MetaArgs) {
  return [{ title: "배송 상세 | GV International" }];
}

interface LoaderData {
  delivery: DeliveryDetail;
  content: ContentItem | null;
  userId: string;
}

export default function DeliveryDetailPage() {
  const { delivery, content, userId } =
    useLoaderData<typeof loader>() as unknown as LoaderData;

  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const prevRef = useRef<{ state: string; action: string | null }>({ state: "idle", action: null });

  const currentAction = (
    fetcher.formData as unknown as FormData | null
  )?.get("_action") as string | null;

  const isDeleting =
    fetcher.state !== "idle" && currentAction === "delete";
  const isMarkingDelivered =
    fetcher.state !== "idle" && currentAction === "mark_delivered";

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
          if (act === "mark_delivered") {
            toast.success("배송 완료 처리되었습니다.");
          }
        }
      }
    }
    prevRef.current.state = fetcher.state;
  }, [fetcher.state, fetcher.data, fetcher.formData]);

  function handleDelete() {
    fetcher.submit({ _action: "delete" }, { method: "post" });
  }

  function handleMarkDelivered() {
    fetcher.submit({ _action: "mark_delivered" }, { method: "post" });
  }

  const pageTitle = delivery.pi?.pi_no
    ? `배송 - ${delivery.pi.pi_no}`
    : "배송 상세";

  const pendingCount = delivery.change_requests.filter(
    (r) => r.status === "pending"
  ).length;

  return (
    <>
      <Header title={pageTitle} backTo="/delivery">
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">
              변경요청 {pendingCount}건
            </Badge>
          )}

          {delivery.status !== "delivered" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkDelivered}
              disabled={isMarkingDelivered || isDeleting}
            >
              {isMarkingDelivered ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              배송완료
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" className="h-8 w-8" variant="outline" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Header>

      <PageContainer>
        <div className="flex flex-col gap-6">
          {/* 배송 정보 */}
          <DeliveryInfoCard delivery={delivery} />

          {/* 변경요청 내역 */}
          <ChangeRequestCard
            requests={delivery.change_requests}
            deliveryId={delivery.id}
            showActions={true}
          />

          {/* 콘텐츠 섹션 */}
          <ContentSection
            content={content}
            contentType="delivery"
            parentId={delivery.id}
            currentUserId={userId}
          />

          {/* 메타 정보 */}
          <div className="text-xs text-zinc-500 flex gap-4">
            <span>작성: {formatDate(delivery.created_at)}</span>
            <span>수정: {formatDate(delivery.updated_at)}</span>
          </div>
        </div>
      </PageContainer>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>배송을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제된 배송은 복구할 수 없습니다. 연결된 오더의 배송 정보도 함께
              초기화됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
