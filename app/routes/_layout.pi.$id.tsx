import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { Header } from "~/components/layout/header";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import { PIDetailInfo } from "~/components/pi/pi-detail-info";
import { PIDetailItems } from "~/components/pi/pi-detail-items";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatDate } from "~/lib/format";
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
  Ship,
  FileDown,
} from "~/components/ui/icons";
import { loader, action } from "~/loaders/pi.$id.server";
import type { PIWithOrgs } from "~/types/pi";
import { usePDFDownload } from "~/hooks/use-pdf-download";
import type { ContentItem } from "~/types/content";
import type { DocStatus } from "~/types/shipping";
import { ContentSection } from "~/components/content/content-section";
import { ErrorBanner } from "~/components/shared/error-banner";

export { loader, action };

interface LinkedShippingDoc {
  id: string;
  ci_no: string;
  pl_no: string;
  ci_date: string;
  status: DocStatus;
  vessel: string | null;
}

export default function PIDetailPage() {
  const { pi, content, userId, linkedShippingDocs } = useLoaderData<typeof loader>() as unknown as {
    pi: PIWithOrgs;
    content: ContentItem | null;
    userId: string;
    linkedShippingDocs: LinkedShippingDoc[];
  };
  const fetcher = useFetcher();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { loading: isPDFLoading, download: downloadPDF } = usePDFDownload();

  async function handlePDFDownload() {
    await downloadPDF(async () => {
      const [{ pdf }, { PIDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("~/components/pdf/pi-document"),
      ]);
      return pdf(<PIDocument data={pi} />).toBlob();
    }, `PI_${pi.pi_no}.pdf`);
  }

  const fetcherError = (fetcher.data as { error?: string } | null)?.error;
  const currentAction = (fetcher.formData as unknown as FormData | null)?.get("_action") as string | null;
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
              <DropdownMenuItem asChild>
                <Link to={`/shipping/new?from_pi=${pi.id}`}>
                  <Ship className="mr-2 h-4 w-4" />
                  선적서류 작성
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handlePDFDownload}
                disabled={isPDFLoading}
              >
                {isPDFLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                PDF 다운로드
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
          {fetcherError && <ErrorBanner message={fetcherError} />}

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

          {/* 연결 선적서류 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">연결 선적서류</CardTitle>
              <Link
                to={`/shipping/new?from_pi=${pi.id}`}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Ship className="h-3 w-3" />
                선적서류 작성
              </Link>
            </CardHeader>
            <CardContent className="p-0 pb-0">
              {linkedShippingDocs.length === 0 ? (
                <p className="text-sm text-zinc-500 px-6 pb-4">연결된 선적서류가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">CI / PL 번호</TableHead>
                        <TableHead>CI 일자</TableHead>
                        <TableHead className="hidden sm:table-cell">선박명</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedShippingDocs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="pl-6">
                            <Link
                              to={`/shipping/${doc.id}`}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              <div>{doc.ci_no}</div>
                              <div className="text-xs text-zinc-500">{doc.pl_no}</div>
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(doc.ci_date)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            {doc.vessel ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={doc.status === "complete" ? "secondary" : "default"}
                            >
                              {doc.status === "complete" ? "완료" : "진행"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 메모 & 첨부파일 & 댓글 */}
          <ContentSection
            content={content}
            contentType="pi"
            parentId={pi.id}
            currentUserId={userId}
          />

          {/* 하단 메타 정보 */}
          <div className="flex gap-4 text-xs text-zinc-500">
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
