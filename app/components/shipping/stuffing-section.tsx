import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatWeight } from "~/lib/format";
import { Button } from "~/components/ui/button";
import { Plus, FileSpreadsheet } from "~/components/ui/icons";
import { StuffingContainerCard } from "~/components/shipping/stuffing-container-card";
import { StuffingContainerForm } from "~/components/shipping/stuffing-container-form";
import type { StuffingList } from "~/types/shipping";

interface StuffingSectionProps {
  shippingDocId: string;
  stuffingLists: StuffingList[];
}

export function StuffingSection({ shippingDocId, stuffingLists }: StuffingSectionProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  // 전체 합계 계산
  const totalContainers = stuffingLists.length;
  const totalRolls = stuffingLists.reduce(
    (sum, sl) => sum + (sl.roll_details?.length ?? 0),
    0
  );
  const totalNetWeight = stuffingLists.reduce(
    (sum, sl) =>
      sum + (sl.roll_details ?? []).reduce((s, r) => s + r.net_weight_kg, 0),
    0
  );
  const totalGrossWeight = stuffingLists.reduce(
    (sum, sl) =>
      sum + (sl.roll_details ?? []).reduce((s, r) => s + r.gross_weight_kg, 0),
    0
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-zinc-400" />
              스터핑 리스트
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                컨테이너 추가
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {stuffingLists.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              등록된 컨테이너가 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {stuffingLists.map((sl) => (
                <StuffingContainerCard
                  key={sl.id}
                  container={sl}
                  shippingDocId={shippingDocId}
                />
              ))}

              {/* 전체 합계 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 py-2 text-xs text-zinc-500 border-t mt-1">
                <span>
                  전체:{" "}
                  <strong className="text-zinc-700">
                    {totalContainers}개
                  </strong>{" "}
                  컨테이너
                </span>
                <span>|</span>
                <span>
                  <strong className="text-zinc-700">{totalRolls}</strong>롤
                </span>
                <span>|</span>
                <span>
                  순중량:{" "}
                  <strong className="text-zinc-700 tabular-nums">
                    {formatWeight(totalNetWeight)}
                  </strong>
                </span>
                <span>|</span>
                <span>
                  총중량:{" "}
                  <strong className="text-zinc-700 tabular-nums">
                    {formatWeight(totalGrossWeight)}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 컨테이너 추가 Dialog */}
      <StuffingContainerForm
        shippingDocId={shippingDocId}
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
      />
    </>
  );
}
