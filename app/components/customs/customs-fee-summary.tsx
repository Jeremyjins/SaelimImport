import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { calcTotalFees } from "~/lib/customs-utils";
import type { FeeBreakdown } from "~/types/customs";

interface FeeSectionProps {
  label: string;
  fee: FeeBreakdown | null;
}

function FeeSection({ label, fee }: FeeSectionProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("ko-KR").format(n);

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <h4 className="text-sm font-medium text-zinc-700">{label}</h4>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-500">공급가액</dt>
          <dd>{fmt(fee?.supply ?? 0)} 원</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">부가세</dt>
          <dd>{fmt(fee?.vat ?? 0)} 원</dd>
        </div>
        <div className="flex justify-between pt-1 border-t font-medium">
          <dt>합계</dt>
          <dd>{fmt(fee?.total ?? 0)} 원</dd>
        </div>
      </dl>
    </div>
  );
}

interface CustomsFeeSummaryProps {
  transportFee: FeeBreakdown | null;
  customsFee: FeeBreakdown | null;
  vatFee: FeeBreakdown | null;
  etcFee: FeeBreakdown | null;
  etcDesc?: string | null;
}

export function CustomsFeeSummary({
  transportFee,
  customsFee,
  vatFee,
  etcFee,
  etcDesc,
}: CustomsFeeSummaryProps) {
  const { totalSupply, totalVat, grandTotal } = calcTotalFees(
    transportFee,
    customsFee,
    vatFee,
    etcFee
  );

  const fmtKRW = (n: number) =>
    new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      minimumFractionDigits: 0,
    }).format(n);

  const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-zinc-700">
          비용 요약
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 4열 그리드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FeeSection label="운송비" fee={transportFee} />
          <FeeSection label="관세" fee={customsFee} />
          <FeeSection label="부가세" fee={vatFee} />
          <FeeSection label="기타비용" fee={etcFee} />
        </div>

        {/* 기타 설명 */}
        {etcDesc && (
          <p className="text-sm text-zinc-500 px-1">{etcDesc}</p>
        )}

        {/* 총 비용 합계 바 */}
        <div className="rounded-lg border bg-zinc-50 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">공급가액 합계</span>
            <span>{fmt(totalSupply)} 원</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">부가세 합계</span>
            <span>{fmt(totalVat)} 원</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm font-medium text-zinc-700">
              총 비용 합계
            </span>
            <span className="text-lg font-bold">{fmtKRW(grandTotal)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
