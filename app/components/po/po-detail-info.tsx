import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatDate } from "~/lib/format";
import type { POWithOrgs } from "~/types/po";

interface PODetailInfoProps {
  po: POWithOrgs;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-sm text-zinc-500 w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium break-words">{value || "-"}</span>
    </div>
  );
}

export function PODetailInfo({ po }: PODetailInfoProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label="PO 번호" value={po.po_no} />
          <InfoRow label="일자" value={formatDate(po.po_date)} />
          <InfoRow
            label="유효기간"
            value={po.validity ? formatDate(po.validity) : "-"}
          />
          <InfoRow label="참조번호" value={po.ref_no ?? "-"} />
        </CardContent>
      </Card>

      {/* 거래 조건 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">거래 조건</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label="공급업체" value={po.supplier?.name_en ?? "-"} />
          <InfoRow label="구매업체" value={po.buyer?.name_en ?? "-"} />
          <InfoRow label="통화" value={po.currency} />
          <InfoRow label="결제조건" value={po.payment_term ?? "-"} />
          <InfoRow label="인도조건" value={po.delivery_term ?? "-"} />
          <InfoRow label="선적항" value={po.loading_port ?? "-"} />
          <InfoRow label="양륙항" value={po.discharge_port ?? "-"} />
        </CardContent>
      </Card>
    </div>
  );
}
