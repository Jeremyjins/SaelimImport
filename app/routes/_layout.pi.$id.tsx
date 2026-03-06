import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import { PIDetailInfo } from "~/components/pi/pi-detail-info";
import { PIDetailItems } from "~/components/pi/pi-detail-items";
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
import {
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Loader2,
} from "~/components/ui/icons";
import { loader, action } from "~/loaders/pi.$id.server";
import type { PIWithOrgs } from "~/types/pi";
import { formatDate } from "~/lib/format";

export { loader, action };

export default function PIDetailPage() {
  const { pi } = useLoaderData<typeof loader>() as unknown as { pi: PIWithOrgs };
  const fetcher = useFetcher();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetcherError = (fetcher.data as { error?: string } | null)?.error;
  const currentAction = fetcher.formData?.get("_action") as string | null;
  const isToggling = fetcher.state !== "idle" && currentAction === "toggle_status";
  const isCloning = fetcher.state !== "idle" && currentAction === "clone";
  const isDeleting = fetcher.state !== "idle" && currentAction === "delete";

  // Optimistic status toggle
  const optimisticStatus =
    isToggling
      ? pi.status === "process"
        ? "complete"
        : "process"
      : pi.status;

  function handleToggle() {
    fetcher.submit(
      { _action: "toggle_status", current_status: pi.status },
      { method: "post" }
    );
  }

  function handleClone() {
    fetcher.submit({ _action: "clone" }, { method: "post" });
  }

  function handleDelete() {
    fetcher.submit({ _action: "delete" }, { method: "post" });
    setShowDeleteDialog(false);
  }

  return (
    <>
      <Header title={pi.pi_no} backTo="/pi">
        <div className="flex items-center gap-2">
          <DocStatusBadge status={optimisticStatus} />

          {/* 상태 토글 버튼 */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggle}
            disabled={fetcher.state !== "idle"}
          >
            {isToggling && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {optimisticStatus === "process" ? "완료 처리" : "진행으로 변경"}
          </Button>

          {/* 액션 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={fetcher.state !== "idle"}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/pi/${pi.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  수정
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClone} disabled={isCloning}>
                {isCloning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                복제
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Header>

      <PageContainer>
        <div className="flex flex-col gap-6">
          {fetcherError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {fetcherError}
            </div>
          )}

          {/* 기본 정보 + 거래 조건 */}
          <PIDetailInfo pi={pi} />

          {/* 품목 내역 */}
          <PIDetailItems
            items={pi.details}
            currency={pi.currency}
            totalAmount={pi.amount}
          />

          {/* 비고 */}
          {pi.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">비고</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{pi.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* 하단 메타 정보 */}
          <div className="flex gap-4 text-xs text-zinc-400">
            <span>작성: {formatDate(pi.created_at)}</span>
            <span>수정: {formatDate(pi.updated_at)}</span>
          </div>
        </div>
      </PageContainer>

      {/* 삭제 확인 AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PI를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {pi.pi_no}를 삭제합니다. 연결된 배송 정보도 함께 삭제되며 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
