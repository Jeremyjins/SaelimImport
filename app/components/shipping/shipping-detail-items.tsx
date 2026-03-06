import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatCurrency } from "~/lib/format";
import type { ShippingLineItem } from "~/types/shipping";

interface ShippingDetailItemsProps {
  items: ShippingLineItem[];
  currency: string;
  totalAmount: number | null;
}

function getProductSpec(item: ShippingLineItem): string | null {
  const parts: string[] = [];
  if (item.gsm) parts.push(`${item.gsm}gsm`);
  if (item.width_mm) parts.push(`${item.width_mm}mm`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function ShippingDetailItems({
  items,
  currency,
  totalAmount,
}: ShippingDetailItemsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">품목 내역</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-0">
        {/* Desktop 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-6">#</TableHead>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">수량 (KG)</TableHead>
                <TableHead className="text-right">판매단가</TableHead>
                <TableHead className="text-right pr-6">금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => {
                const spec = getProductSpec(item);
                return (
                  <TableRow key={i}>
                    <TableCell className="text-zinc-400 text-xs pl-6">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{item.product_name}</div>
                      {spec && (
                        <div className="text-xs text-zinc-400">{spec}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {item.quantity_kg.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatCurrency(item.unit_price, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium pr-6">
                      {formatCurrency(item.amount, currency)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* 합계 행 */}
              <TableRow className="bg-zinc-50">
                <TableCell
                  colSpan={4}
                  className="text-right text-sm font-semibold pl-6"
                >
                  합계
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm font-semibold pr-6">
                  {formatCurrency(totalAmount, currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Mobile 카드 목록 */}
        <div className="md:hidden flex flex-col divide-y">
          {items.map((item, i) => {
            const spec = getProductSpec(item);
            return (
              <div key={i} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-400 shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium truncate">
                        {item.product_name}
                      </span>
                    </div>
                    {spec && (
                      <div className="text-xs text-zinc-400 mt-0.5 ml-4">{spec}</div>
                    )}
                    <div className="text-xs text-zinc-400 mt-1 ml-4">
                      {item.quantity_kg.toLocaleString("en-US")} KG ×{" "}
                      {formatCurrency(item.unit_price, currency)}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">
                    {formatCurrency(item.amount, currency)}
                  </span>
                </div>
              </div>
            );
          })}
          {/* 합계 */}
          <div className="p-4 bg-zinc-50 flex justify-between items-center">
            <span className="text-sm font-semibold">합계</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(totalAmount, currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
