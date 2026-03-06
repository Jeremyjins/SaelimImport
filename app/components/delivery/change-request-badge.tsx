import { Badge } from "~/components/ui/badge";
import type { ChangeRequestStatus } from "~/types/delivery";

const STATUS_CONFIG: Record<
  ChangeRequestStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "대기",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  approved: {
    label: "승인",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  rejected: {
    label: "거부",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

interface ChangeRequestBadgeProps {
  status: string | null;
}

export function ChangeRequestBadge({ status }: ChangeRequestBadgeProps) {
  const config =
    STATUS_CONFIG[(status as ChangeRequestStatus) ?? "pending"] ??
    STATUS_CONFIG.pending;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

interface DeliveryStatusBadgeProps {
  status: string;
}

const DELIVERY_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: "대기",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  scheduled: {
    label: "예정",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  delivered: {
    label: "완료",
    className: "bg-green-100 text-green-700 border-green-200",
  },
};

export function DeliveryStatusBadge({ status }: DeliveryStatusBadgeProps) {
  const config =
    DELIVERY_STATUS_CONFIG[status] ?? DELIVERY_STATUS_CONFIG.pending;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
