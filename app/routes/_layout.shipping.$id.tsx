import { useLoaderData, useFetcher, Link } from "react-router";
import { useState, useEffect, useRef } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import { ShippingDetailInfo } from "~/components/shipping/shipping-detail-info";
import { ShippingDetailItems } from "~/components/shipping/shipping-detail-items";
import { ShippingWeightSummary } from "~/components/shipping/shipping-weight-summary";
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
  Receipt,
  FileDown,
} from "~/components/ui/icons";
import { loader, action } from "~/loaders/shipping.$id.server";
import type { ShippingWithOrgs } from "~/types/shipping";
import type { ContentItem } from "~/types/content";
import { formatDate } from "~/lib/format";
import { usePDFDownload } from "~/hooks/use-pdf-download";
import { ContentSection } from "~/components/content/content-section";
import { StuffingSection } from "~/components/shipping/stuffing-section";
import { ErrorBanner } from "~/components/shared/error-banner";
import { toast } from "sonner";

export { loader, action };

export default function ShippingDetailPage() {
  const { shipping, content, userId } = useLoaderData<typeof loader>() as unknown as {
    shipping: ShippingWithOrgs;
    content: ContentItem | null;
    userId: string;
  };
  const fetcher = useFetcher();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const prevFetcherState = useRef(fetcher.state);
  const { loading: isPDFLoading, download: downloadPDF } = usePDFDownload();

  async function handleCIDownload() {
    await downloadPDF(async () => {
      const [{ pdf }, { CIDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("~/components/pdf/ci-document"),
      ]);
      return pdf(<CIDocument data={shipping} />).toBlob();
    }, `CI_${shipping.ci_no}.pdf`);
  }

  async function handlePLDownload() {
    await downloadPDF(async () => {
      const [{ pdf }, { PLDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("~/components/pdf/pl-document"),
      ]);
      return pdf(<PLDocument data={shipping} />).toBlob();
    }, `PL_${shipping.pl_no}.pdf`);
  }

  async function handleSLDownload() {
    await downloadPDF(async () => {
      const [{ pdf }, { SLDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("~/components/pdf/sl-document"),
      ]);
      return pdf(<SLDocument data={shipping} />).toBlob();
    }, `SL_${shipping.ci_no}_ALL.pdf`);
  }

  const fetcherError = (fetcher.data as { error?: string } | null)?.error;
  const currentAction = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;
  const isToggling = fetcher.state !== "idle" && currentAction === "toggle_status";
  const isCloning = fetcher.state !== "idle" && currentAction === "clone";
  const isDeleting = fetcher.state !== "idle" && currentAction === "delete";

  // Toast for stuffing actions
  useEffect(() => {
    if (prevFetcherState.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as { success?: boolean; error?: string; count?: number } | null;
      const action = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;
      if (!result || !action?.startsWith("stuffing_")) return;
      if (result.success) {
        if (action === "stuffing_create") toast.success("컨테이너가 추가되었습니다.");
        else if (action === "stuffing_update") toast.success("컨테이너가 수정되었습니다.");
        else if (action === "stuffing_delete") toast.success("컨테이너가 삭제되었습니다.");
        else if (action === "stuffing_csv")
          toast.success(`CSV 업로드 완료. ${result.count ?? 0}개 롤이 업로드되었습니다.`);
      } else if (result.error) {
        toast.error(result.error);
      }
    }
    prevFetcherState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, fetcher.formData]);

  // Optimistic status toggle
  const optimisticStatus =
    isToggling
      ? shipping.status === "process"
        ? "complete"
        : "process"
      : shipping.status;

  function handleToggle() {
    fetcher.submit(
      { _action: "toggle_status", current_status: shipping.status },
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
      <Header title={`${shipping.ci_no} / ${shipping.pl_no}`} backTo="/shipping">
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
                <Link to={`/shipping/${shipping.id}/edit`}>
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
                <Link to={`/customs/new?from_shipping=${shipping.id}`}>
                  <Receipt className="mr-2 h-4 w-4" />
                  통관 생성
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleCIDownload}
                disabled={isPDFLoading}
              >
                {isPDFLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                CI 다운로드
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handlePLDownload}
                disabled={isPDFLoading}
              >
                {isPDFLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                PL 다운로드
              </DropdownMenuItem>
              {shipping.stuffing_lists && shipping.stuffing_lists.length > 0 && (
                <DropdownMenuItem
                  onClick={handleSLDownload}
                  disabled={isPDFLoading}
                >
                  {isPDFLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="mr-2 h-4 w-4" />
                  )}
                  SL 다운로드
                </DropdownMenuItem>
              )}
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
          {fetcherError && <ErrorBanner message={fetcherError} />}

          {/* 기본정보 + 거래조건 + 선적정보 */}
          <ShippingDetailInfo shipping={shipping} />

          {/* 품목 내역 */}
          <ShippingDetailItems
            items={shipping.details}
            currency={shipping.currency}
            totalAmount={shipping.amount}
          />

          {/* 중량 / 포장 */}
          <ShippingWeightSummary
            grossWeight={shipping.gross_weight}
            netWeight={shipping.net_weight}
            packageNo={shipping.package_no}
          />

          {/* 스터핑 리스트 */}
          <StuffingSection
            shippingDocId={shipping.id}
            stuffingLists={shipping.stuffing_lists ?? []}
          />

          {/* 비고 */}
          {shipping.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">비고</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{shipping.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* 메모 & 첨부파일 & 댓글 */}
          <ContentSection
            content={content}
            contentType="shipping"
            parentId={shipping.id}
            currentUserId={userId}
          />

          {/* 하단 메타 정보 */}
          <div className="flex gap-4 text-xs text-zinc-500">
            <span>작성: {formatDate(shipping.created_at)}</span>
            <span>수정: {formatDate(shipping.updated_at)}</span>
          </div>
        </div>
      </PageContainer>

      {/* 삭제 확인 AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선적서류를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {shipping.ci_no} / {shipping.pl_no}를 삭제합니다. 연결된 배송 정보의
              선적서류 연결도 해제되며 복구할 수 없습니다.
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
