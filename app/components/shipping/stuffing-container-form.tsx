import { useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { Plus, Trash2, Loader2 } from "~/components/ui/icons";
import type { StuffingList, StuffingRollDetail } from "~/types/shipping";

interface StuffingContainerFormProps {
  shippingDocId: string;
  container?: StuffingList; // 수정 시, 없으면 생성
  open: boolean;
  onClose: () => void;
}

type RollRow = StuffingRollDetail;

function emptyRoll(rollNo: number): RollRow {
  return {
    roll_no: rollNo,
    product_name: "",
    gsm: 0,
    width_mm: 0,
    length_m: 0,
    net_weight_kg: 0,
    gross_weight_kg: 0,
  };
}

export function StuffingContainerForm({
  shippingDocId,
  container,
  open,
  onClose,
}: StuffingContainerFormProps) {
  const fetcher = useFetcher();
  const isEdit = !!container;

  const [slNo, setSlNo] = useState(container?.sl_no ?? "");
  const [cntrNo, setCntrNo] = useState(container?.cntr_no ?? "");
  const [sealNo, setSealNo] = useState(container?.seal_no ?? "");
  const [rolls, setRolls] = useState<RollRow[]>(
    container?.roll_details?.length ? container.roll_details : [emptyRoll(1)]
  );

  const prevState = useRef(fetcher.state);

  // 완료 후 닫기
  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle") {
      const result = fetcher.data as { success?: boolean } | null;
      if (result?.success) {
        onClose();
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, onClose]);

  // Dialog 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setSlNo(container?.sl_no ?? "");
      setCntrNo(container?.cntr_no ?? "");
      setSealNo(container?.seal_no ?? "");
      setRolls(
        container?.roll_details?.length ? container.roll_details : [emptyRoll(1)]
      );
    }
  }, [open, container]);

  function addRoll() {
    const lastNo = rolls.length > 0 ? rolls[rolls.length - 1].roll_no : 0;
    setRolls([...rolls, emptyRoll(lastNo + 1)]);
  }

  function removeRoll(index: number) {
    setRolls(rolls.filter((_, i) => i !== index));
  }

  function updateRoll(index: number, field: keyof RollRow, value: string) {
    setRolls(
      rolls.map((r, i) =>
        i === index
          ? {
              ...r,
              [field]:
                field === "product_name"
                  ? value
                  : value === ""
                  ? 0
                  : Number(value),
            }
          : r
      )
    );
  }

  function handleSave() {
    fetcher.submit(
      {
        _action: isEdit ? "stuffing_update" : "stuffing_create",
        ...(isEdit && { stuffing_id: container!.id }),
        sl_no: slNo,
        cntr_no: cntrNo,
        seal_no: sealNo,
        roll_details: JSON.stringify(rolls),
      },
      { method: "post" }
    );
  }

  const isSubmitting = fetcher.state !== "idle";
  const serverError = (fetcher.data as { error?: string } | null)?.error;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "컨테이너 수정" : "컨테이너 추가"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {serverError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}

          {/* 컨테이너 기본 정보 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl_no">SL 번호</Label>
              <Input
                id="sl_no"
                value={slNo}
                onChange={(e) => setSlNo(e.target.value)}
                placeholder="예: SL-001 (자동 채번)"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cntr_no">컨테이너 번호</Label>
              <Input
                id="cntr_no"
                value={cntrNo}
                onChange={(e) => setCntrNo(e.target.value)}
                placeholder="예: ABCU1234567"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seal_no">씰 번호</Label>
              <Input
                id="seal_no"
                value={sealNo}
                onChange={(e) => setSealNo(e.target.value)}
                placeholder="예: K12345"
              />
            </div>
          </div>

          {/* 롤 상세 편집 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">롤 상세 ({rolls.length}개)</span>
              <Button type="button" variant="outline" size="sm" onClick={addRoll}>
                <Plus className="h-3 w-3 mr-1" />
                롤 추가
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b text-xs text-zinc-500">
                    <th className="px-2 py-2 text-left font-medium w-16">롤 번호</th>
                    <th className="px-2 py-2 text-left font-medium">품목명</th>
                    <th className="px-2 py-2 text-right font-medium w-16">GSM</th>
                    <th className="px-2 py-2 text-right font-medium w-20">폭 (mm)</th>
                    <th className="px-2 py-2 text-right font-medium w-24">길이 (m)</th>
                    <th className="px-2 py-2 text-right font-medium w-28">순중량 (KG)</th>
                    <th className="px-2 py-2 text-right font-medium w-28">총중량 (KG)</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rolls.map((roll, index) => (
                    <tr key={index} className="hover:bg-zinc-50">
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          value={roll.roll_no || ""}
                          onChange={(e) => updateRoll(index, "roll_no", e.target.value)}
                          min={1}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-7 text-xs w-full min-w-24"
                          value={roll.product_name}
                          onChange={(e) => updateRoll(index, "product_name", e.target.value)}
                          placeholder="품목명"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          value={roll.gsm || ""}
                          onChange={(e) => updateRoll(index, "gsm", e.target.value)}
                          min={0}
                          step={0.1}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          value={roll.width_mm || ""}
                          onChange={(e) => updateRoll(index, "width_mm", e.target.value)}
                          min={0}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          value={roll.length_m || ""}
                          onChange={(e) => updateRoll(index, "length_m", e.target.value)}
                          min={0}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          value={roll.net_weight_kg || ""}
                          onChange={(e) => updateRoll(index, "net_weight_kg", e.target.value)}
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          value={roll.gross_weight_kg || ""}
                          onChange={(e) => updateRoll(index, "gross_weight_kg", e.target.value)}
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => removeRoll(index)}
                          className="text-zinc-400 hover:text-red-500 transition-colors"
                          disabled={rolls.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? "수정" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
