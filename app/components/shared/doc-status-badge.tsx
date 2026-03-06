import { Badge } from "~/components/ui/badge";
import type { DocStatus } from "~/types/common";

const STATUS_LABELS: Record<DocStatus, string> = {
  process: "진행",
  complete: "완료",
};

const STATUS_VARIANTS: Record<DocStatus, "default" | "secondary" | "outline"> = {
  process: "default",
  complete: "secondary",
};

interface DocStatusBadgeProps {
  status: DocStatus;
}

export function DocStatusBadge({ status }: DocStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
