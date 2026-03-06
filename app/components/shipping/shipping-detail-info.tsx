import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatDate } from "~/lib/format";
import type { ShippingWithOrgs } from "~/types/shipping";

interface ShippingDetailInfoProps {
  shipping: ShippingWithOrgs;
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

export function ShippingDetailInfo({ shipping }: ShippingDetailInfoProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label="CI 번호" value={shipping.ci_no} />
          <InfoRow label="PL 번호" value={shipping.pl_no} />
          <InfoRow label="CI 일자" value={formatDate(shipping.ci_date)} />
          <InfoRow
            label="선적일"
            value={shipping.ship_date ? formatDate(shipping.ship_date) : "-"}
          />
          <InfoRow label="참조번호" value={shipping.ref_no ?? "-"} />
          {shipping.pi && shipping.pi_id && (
            <InfoRow label="참조 PI">
              <Link
                to={`/pi/${shipping.pi_id}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                {shipping.pi.pi_no}
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
          <InfoRow label="송하인" value={shipping.shipper?.name_en ?? "-"} />
          <InfoRow label="수하인" value={shipping.consignee?.name_en ?? "-"} />
          <InfoRow label="통화" value={shipping.currency} />
          <InfoRow label="결제조건" value={shipping.payment_term ?? "-"} />
          <InfoRow label="인도조건" value={shipping.delivery_term ?? "-"} />
          <InfoRow label="선적항" value={shipping.loading_port ?? "-"} />
          <InfoRow label="양륙항" value={shipping.discharge_port ?? "-"} />
        </CardContent>
      </Card>

      {/* 선적 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">선적 정보</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InfoRow label="선박명" value={shipping.vessel ?? "-"} />
          <InfoRow label="항차" value={shipping.voyage ?? "-"} />
          <InfoRow
            label="출항예정일"
            value={shipping.etd ? formatDate(shipping.etd) : "-"}
          />
          <InfoRow
            label="도착예정일"
            value={shipping.eta ? formatDate(shipping.eta) : "-"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
