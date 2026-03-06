import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import { PODetailInfo } from "~/components/po/po-detail-info";
import { PODetailItems } from "~/components/po/po-detail-items";
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
  FileText,
} from "~/components/ui/icons";
import { loader, action } from "~/loaders/po.$id.server";
import type { POWithOrgs } from "~/types/po";
import type { ContentItem } from "~/types/content";
import { formatDate, formatCurrency } from "~/lib/format";
import type { DocStatus } from "~/types/common";
import { ContentSection } from "~/components/content/content-section";

export { loader, action };

interface ConnectedPI {
  id: string;
  pi_no: string;
  pi_date: string;
  status: DocStatus;
  currency: string;
  amount: number | null;
}

export default function PODetailPage() {
  const { po, pis, content, userId } = useLoaderData<typeof loader>() as unknown as {
    po: POWithOrgs;
    pis: ConnectedPI[];
    content: ContentItem | null;
    userId: string;
  };
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
      ? po.status === "process"
        ? "complete"
        : "process"
      : po.status;

  function handleToggle() {
    fetcher.submit(
      { _action: "toggle_status", current_status: po.status },
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
      <Header title={po.po_no} backTo="/po">
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
                <Link to={`/po/${po.id}/edit`}>
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
              <DropdownMenuItem asChild>
                <Link to={`/pi/new?from_po=${po.id}`}>
                  <FileText className="mr-2 h-4 w-4" />
                  PI 작성
                </Link>
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
          <PODetailInfo po={po} />

          {/* 품목 내역 */}
          <PODetailItems
            items={po.details}
            currency={po.currency}
            totalAmount={po.amount}
          />

          {/* 비고 */}
          {po.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">비고</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{po.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* 연결된 PI 목록 */}
          {pis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">연결된 견적서 (PI)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-0">
                <div className="flex flex-col divide-y">
                  {pis.map((pi) => (
                    <Link
                      key={pi.id}
                      to={`/pi/${pi.id}`}
                      className="flex items-center justify-between px-6 py-3 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{pi.pi_no}</span>
                        <DocStatusBadge status={pi.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-500">
                        <span>{formatDate(pi.pi_date)}</span>
                        <span className="tabular-nums font-medium text-zinc-700">
                          {formatCurrency(pi.amount, pi.currency)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 메모 & 첨부파일 & 댓글 */}
          <ContentSection
            content={content}
            contentType="po"
            parentId={po.id}
            currentUserId={userId}
          />

          {/* 하단 메타 정보 */}
          <div className="flex gap-4 text-xs text-zinc-400">
            <span>작성: {formatDate(po.created_at)}</span>
            <span>수정: {formatDate(po.updated_at)}</span>
          </div>
        </div>
      </PageContainer>

      {/* 삭제 확인 AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PO를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {po.po_no}를 삭제합니다. 삭제된 PO는 복구할 수 없습니다.
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
