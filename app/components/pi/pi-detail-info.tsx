import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatDate } from "~/lib/format";
import type { PIWithOrgs } from "~/types/pi";

interface PIDetailInfoProps {
  pi: PIWithOrgs;
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-sm text-zinc-500 w-24 shrink-0">{label}</span>
      {children ?? (
        <span className="text-sm font-medium break-words">{value || "-"}</span>
      )}
    </div>
  );
}

export function PIDetailInfo({ pi }: PIDetailInfoProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label="PI 번호" value={pi.pi_no} />
          <InfoRow label="일자" value={formatDate(pi.pi_date)} />
          <InfoRow
            label="유효기간"
            value={pi.validity ? formatDate(pi.validity) : "-"}
          />
          <InfoRow label="참조번호" value={pi.ref_no ?? "-"} />
          {pi.po && (
            <InfoRow label="참조 PO">
              <Link
                to={`/po/${pi.po_id}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                {pi.po.po_no}
              </Link>
            </InfoRow>
          )}
        </CardContent>
      </Card>

      {/* 거래 조건 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">거래 조건</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label="판매자" value={pi.supplier?.name_en ?? "-"} />
          <InfoRow label="구매자" value={pi.buyer?.name_en ?? "-"} />
          <InfoRow label="통화" value={pi.currency} />
          <InfoRow label="결제조건" value={pi.payment_term ?? "-"} />
          <InfoRow label="인도조건" value={pi.delivery_term ?? "-"} />
          <InfoRow label="선적항" value={pi.loading_port ?? "-"} />
          <InfoRow label="양륙항" value={pi.discharge_port ?? "-"} />
        </CardContent>
      </Card>
    </div>
  );
}
