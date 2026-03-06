import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatWeight } from "~/lib/format";

interface ShippingWeightSummaryProps {
  grossWeight: number | null;
  netWeight: number | null;
  packageNo: number | null;
}

function WeightItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 items-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function ShippingWeightSummary({
  grossWeight,
  netWeight,
  packageNo,
}: ShippingWeightSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">중량 / 포장</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center divide-x">
          <WeightItem label="총중량 (Gross)" value={formatWeight(grossWeight)} />
          <WeightItem label="순중량 (Net)" value={formatWeight(netWeight)} />
          <WeightItem
            label="포장수 (Packages)"
            value={packageNo != null ? `${packageNo.toLocaleString("en-US")} PCS` : "-"}
          />
        </div>
        {grossWeight == null && netWeight == null && packageNo == null && (
          <p className="text-xs text-zinc-400 text-center mt-3">
            스터핑 리스트 등록 후 자동으로 업데이트됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
