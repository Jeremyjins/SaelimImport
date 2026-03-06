import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
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
import { MoreHorizontal, Pencil, Trash2, Loader2, FileDown } from "~/components/ui/icons";
import { usePDFDownload } from "~/hooks/use-pdf-download";
import { CustomsDetailInfo } from "~/components/customs/customs-detail-info";
import { CustomsFeeSummary } from "~/components/customs/customs-fee-summary";
import { ContentSection } from "~/components/content/content-section";
import { formatDate } from "~/lib/format";
import { toast } from "sonner";
import type { CustomsDetail } from "~/types/customs";
import type { ContentItem } from "~/types/content";
import { loader, action } from "~/loaders/customs.$id.server";

export { loader, action };

interface LoaderData {
  customs: CustomsDetail;
  content: ContentItem | null;
  userId: string;
}

export default function CustomsDetailPage() {
  const { customs: rawCustoms, content, userId } =
    useLoaderData<typeof loader>() as unknown as LoaderData;

  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { loading: isPDFLoading, download: downloadPDF } = usePDFDownload();
  const prevStateRef = useRef(fetcher.state);

  const currentAction = (fetcher.formData as unknown as FormData | null)?.get(
    "_action"
  ) as string | null;
  const isTogglingFee =
    fetcher.state !== "idle" && currentAction === "toggle_fee_received";
  const isDeleting =
    fetcher.state !== "idle" && currentAction === "delete";

  // 옵티미스틱 fee_received 상태
  const optimisticFeeReceived = isTogglingFee
    ? !rawCustoms.fee_received
    : (rawCustoms.fee_received ?? false);

  // Toast 피드백
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
      } else if (result.success) {
        if (act === "toggle_fee_received") {
          toast.success("비용수령 상태가 변경되었습니다.");
        }
      }
    }
    prevStateRef.current = fetcher.state;
  }, [fetcher.state, fetcher.data, fetcher.formData]);

  function handleToggleFee() {
    fetcher.submit({ _action: "toggle_fee_received" }, { method: "post" });
  }

  function handleDelete() {
    fetcher.submit({ _action: "delete" }, { method: "post" });
  }

  async function handleInvoiceDownload() {
    const filename = rawCustoms.customs_no
      ? `Invoice_${rawCustoms.customs_no}.pdf`
      : "Invoice_customs.pdf";
    await downloadPDF(async () => {
      const [{ pdf }, { InvoiceDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("~/components/pdf/invoice-document"),
      ]);
      return pdf(<InvoiceDocument data={rawCustoms} />).toBlob();
    }, filename);
  }

  const pageTitle = rawCustoms.customs_no
    ? `통관 ${rawCustoms.customs_no}`
    : "통관서류 상세";

  return (
    <>
      <Header title={pageTitle} backTo="/customs">
        <div className="flex items-center gap-2">
          {/* 비용수령 배지 */}
          {optimisticFeeReceived ? (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              수령완료
            </Badge>
          ) : (
            <Badge variant="outline">미수령</Badge>
          )}

          {/* 액션 드롭다운 */}
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
              <DropdownMenuItem
                onClick={() => navigate(`/customs/${rawCustoms.id}/edit`)}
                disabled={isPDFLoading}
              >
                <Pencil className="h-4 w-4 mr-2" />
                통관서류 수정
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleInvoiceDownload}
                disabled={isPDFLoading}
              >
                <FileDown className="h-4 w-4 mr-2" />
                인보이스 다운로드
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isPDFLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                통관서류 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Header>

      <PageContainer>
        <div className="space-y-4">
          {/* Section 1: 기본 정보 */}
          <CustomsDetailInfo
            customs={rawCustoms}
            optimisticFeeReceived={optimisticFeeReceived}
            isTogglingFee={isTogglingFee}
            onToggleFee={handleToggleFee}
          />

          {/* Section 2: 비용 요약 */}
          <CustomsFeeSummary
            transportFee={rawCustoms.transport_fee}
            customsFee={rawCustoms.customs_fee}
            vatFee={rawCustoms.vat_fee}
            etcFee={rawCustoms.etc_fee}
            etcDesc={rawCustoms.etc_desc}
          />

          {/* Section 3: Content (메모 & 첨부) */}
          <ContentSection
            content={content}
            contentType="customs"
            parentId={rawCustoms.id}
            currentUserId={userId}
          />

          {/* 메타 정보 */}
          <div className="text-xs text-zinc-400 flex gap-4 pb-4">
            <span>생성: {formatDate(rawCustoms.created_at)}</span>
            {rawCustoms.updated_at && (
              <span>수정: {formatDate(rawCustoms.updated_at)}</span>
            )}
          </div>
        </div>
      </PageContainer>

      {/* 삭제 확인 Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>통관서류를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제된 통관서류는 복구할 수 없습니다. 연결된 오더에서도 통관
              정보가 해제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
