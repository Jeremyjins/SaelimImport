import { useFetcher } from "react-router";
import { useState } from "react";
import { formatWeight } from "~/lib/format";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
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
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Loader2,
  Upload,
} from "~/components/ui/icons";
import { StuffingRollTable } from "~/components/shipping/stuffing-roll-table";
import { StuffingContainerForm } from "~/components/shipping/stuffing-container-form";
import { StuffingCSVUpload } from "~/components/shipping/stuffing-csv-upload";
import type { StuffingList } from "~/types/shipping";

interface StuffingContainerCardProps {
  container: StuffingList;
  shippingDocId: string;
}

export function StuffingContainerCard({
  container,
  shippingDocId,
}: StuffingContainerCardProps) {
  const fetcher = useFetcher();
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCSVDialog, setShowCSVDialog] = useState(false);

  const rolls = container.roll_details ?? [];
  const rollCount = rolls.length;
  const netWeightSum = rolls.reduce((s, r) => s + r.net_weight_kg, 0);

  const isDeleting =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("_action") === "stuffing_delete";

  function handleDelete() {
    fetcher.submit(
      { _action: "stuffing_delete", stuffing_id: container.id },
      { method: "post" }
    );
    setShowDeleteDialog(false);
  }

  return (
    <>
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="border rounded-lg overflow-hidden"
      >
        <CollapsibleTrigger className="w-full hover:bg-zinc-50 transition-colors">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
              )}
              <div className="text-left">
                <div className="text-sm font-medium">
                  {container.sl_no ?? "SL-?"}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {container.cntr_no ? `CNTR: ${container.cntr_no}` : "컨테이너 번호 없음"}
                  {container.seal_no && ` | Seal: ${container.seal_no}`}
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500 shrink-0 ml-4">
              <div>
                {rollCount > 0
                  ? `${rollCount}롤 (Roll ${container.roll_no_range ?? "?"})`
                  : "롤 없음"}
              </div>
              {rollCount > 0 && (
                <div className="tabular-nums">
                  순중량: {formatWeight(netWeightSum)}
                </div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            <StuffingRollTable rolls={rolls} />
          </div>

          <div className="flex justify-end gap-2 px-4 py-2 bg-zinc-50 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCSVDialog(true)}
            >
              <Upload className="mr-1 h-3 w-3" />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
            >
              <Pencil className="mr-1 h-3 w-3" />
              수정
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-600 border-red-200 hover:border-red-300"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              삭제
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 수정 Dialog */}
      <StuffingContainerForm
        shippingDocId={shippingDocId}
        container={container}
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
      />

      {/* CSV 업로드 Dialog */}
      <StuffingCSVUpload
        container={container}
        open={showCSVDialog}
        onClose={() => setShowCSVDialog(false)}
      />

      {/* 삭제 확인 Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>컨테이너를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {container.sl_no ?? "이 컨테이너"}를 삭제합니다. 포함된 롤 데이터 ({rollCount}개)가 모두 삭제되며 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
