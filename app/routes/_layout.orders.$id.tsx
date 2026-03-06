import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import { OrderCYWarning } from "~/components/orders/order-cy-warning";
import { OrderDateTimeline } from "~/components/orders/order-date-timeline";
import { OrderDocLinks } from "~/components/orders/order-doc-links";
import { OrderInlineFields } from "~/components/orders/order-inline-fields";
import { ContentSection } from "~/components/content/content-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
import { MoreHorizontal, Trash2, Loader2 } from "~/components/ui/icons";
import type { OrderDetail } from "~/types/order";
import type { ContentItem } from "~/types/content";
import { formatDate } from "~/lib/format";
import { toast } from "sonner";
import { loader, action } from "~/loaders/orders.$id.server";

export { loader, action };

interface LoaderData {
  order: OrderDetail;
  content: ContentItem | null;
  userId: string;
}

export default function OrderDetailPage() {
  const { order: rawOrder, content, userId } = useLoaderData<typeof loader>() as unknown as LoaderData;

  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const prevStateRef = useRef(fetcher.state);

  const currentAction = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;
  const isTogglingStatus = fetcher.state !== "idle" && currentAction === "toggle_status";
  const isRefreshingLinks = fetcher.state !== "idle" && currentAction === "refresh_links";
  const isDeleting = fetcher.state !== "idle" && currentAction === "delete";

  // 옵티미스틱 상태
  const optimisticStatus =
    isTogglingStatus
      ? (rawOrder.status === "process" ? "complete" : "process")
      : rawOrder.status;

  // Toast 피드백
  useEffect(() => {
    if (prevStateRef.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as { success?: boolean; error?: string; linked?: number } | null;
      const action = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;

      if (!result || !action) return;

      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        if (action === "update_fields") toast.success("저장되었습니다.");
        else if (action === "toggle_status") toast.success(`상태가 변경되었습니다.`);
        else if (action === "toggle_customs_fee") toast.success("통관비 수령 상태가 변경되었습니다.");
        else if (action === "link_document") toast.success("서류가 연결되었습니다.");
        else if (action === "unlink_document") toast.success("서류 연결이 해제되었습니다.");
        else if (action === "refresh_links") {
          const linked = result.linked ?? 0;
          toast.success(linked > 0 ? `${linked}개 서류가 새로 연결되었습니다.` : "새로 연결할 서류가 없습니다.");
        }
      }
    }
    prevStateRef.current = fetcher.state;
  }, [fetcher.state, fetcher.data, fetcher.formData]);

  function handleToggleStatus() {
    fetcher.submit({ _action: "toggle_status" }, { method: "post" });
  }

  function handleDelete() {
    fetcher.submit({ _action: "delete" }, { method: "post" });
  }

  function handleRefreshLinks() {
    fetcher.submit({ _action: "refresh_links" }, { method: "post" });
  }

  const pageTitle = rawOrder.saelim_no ?? `오더 ${rawOrder.id.slice(0, 8)}`;

  return (
    <>
      <Header title={pageTitle} backTo="/orders">
        <div className="flex items-center gap-2">
          <DocStatusBadge status={optimisticStatus} />
          <OrderCYWarning
            arrivalDate={rawOrder.arrival_date}
            customsDate={rawOrder.customs?.customs_date ?? null}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleToggleStatus} disabled={isTogglingStatus}>
                {optimisticStatus === "process" ? "완료 처리" : "진행으로 변경"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                오더 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Header>

      <PageContainer>
        <div className="flex flex-col gap-6">
          {/* Section 1: 날짜 타임라인 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>진행 타임라인</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderDateTimeline order={rawOrder} />
            </CardContent>
          </Card>

          {/* Section 2: 연결 서류 */}
          <Card>
            <CardContent className="pt-4">
              <OrderDocLinks
                order={rawOrder}
                onRefreshLinks={handleRefreshLinks}
                isRefreshing={isRefreshingLinks}
              />
            </CardContent>
          </Card>

          {/* Section 3: 오더 정보 (Inline 수정) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>오더 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderInlineFields order={rawOrder} />
            </CardContent>
          </Card>

          {/* Section 4: Content 시스템 */}
          <ContentSection
            content={content}
            contentType="order"
            parentId={rawOrder.id}
            currentUserId={userId}
          />

          {/* 메타 정보 */}
          <div className="text-xs text-zinc-500 flex gap-4 pb-4">
            <span>작성: {formatDate(rawOrder.created_at)}</span>
            {rawOrder.updated_at && (
              <span>수정: {formatDate(rawOrder.updated_at)}</span>
            )}
          </div>
        </div>
      </PageContainer>

      {/* 삭제 확인 Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>오더를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              오더가 삭제됩니다. 연결된 PO/PI/선적서류는 영향을 받지 않습니다.
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
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
