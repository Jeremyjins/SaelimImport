import { Link } from "react-router";
import { Card } from "~/components/ui/card";
import { Package } from "~/components/ui/icons";
import { DocStatusBadge } from "~/components/shared/doc-status-badge";
import type { DocStatus } from "~/types/common";

interface RecentOrder {
  id: string;
  saelim_no: string | null;
  status: string;
  created_at: string | null;
}

interface RecentActivityProps {
  orders: RecentOrder[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function RecentActivity({ orders }: RecentActivityProps) {
  return (
    <Card className="p-4 bg-white border-zinc-200">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-zinc-900">최근 오더</h3>
      </div>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-zinc-400">등록된 오더가 없습니다.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="flex items-center justify-between py-2.5 hover:bg-zinc-50 -mx-1 px-1 rounded transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 truncate">
                  {order.saelim_no ?? "(번호 미입력)"}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{formatDate(order.created_at)}</p>
              </div>
              <div className="ml-3 shrink-0">
                <DocStatusBadge status={order.status as DocStatus} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
