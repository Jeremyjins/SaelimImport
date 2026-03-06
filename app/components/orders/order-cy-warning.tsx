import { Badge } from "~/components/ui/badge";
import type { CYStatus } from "~/types/order";

const CY_FREE_DAYS = 14;

interface CYInfo {
  status: CYStatus;
  days: number | null;
  label: string;
}

export function calcCY(
  arrivalDate: string | null,
  customsDate: string | null
): CYInfo {
  if (!arrivalDate) {
    return { status: "pending", days: null, label: "도착일 미정" };
  }

  const arrival = new Date(arrivalDate);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (arrival > today) {
    const diffMs = arrival.getTime() - today.getTime();
    const dDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return { status: "pending", days: null, label: `D-${dDays} 도착예정` };
  }

  const endDate = customsDate ? new Date(customsDate) : today;
  const diffMs = endDate.getTime() - arrival.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days <= 10) {
    return { status: "ok", days, label: `CY ${days}일 (${CY_FREE_DAYS}일 중)` };
  } else if (days <= CY_FREE_DAYS) {
    const remaining = CY_FREE_DAYS - days;
    return { status: "warning", days, label: `CY ${days}일 (${remaining}일 남음)` };
  } else {
    const over = days - CY_FREE_DAYS;
    return { status: "overdue", days, label: `CY ${days}일 (${over}일 초과)` };
  }
}

const CY_VARIANT: Record<CYStatus, "outline" | "default" | "secondary" | "destructive"> = {
  pending: "outline",
  ok: "secondary",
  warning: "default",
  overdue: "destructive",
};

const CY_CLASS: Record<CYStatus, string> = {
  pending: "text-zinc-500",
  ok: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
};

interface Props {
  arrivalDate: string | null;
  customsDate: string | null;
}

export function OrderCYWarning({ arrivalDate, customsDate }: Props) {
  const cy = calcCY(arrivalDate, customsDate);

  if (cy.status === "pending" && !arrivalDate) return null;

  return (
    <Badge variant={CY_VARIANT[cy.status]} className={CY_CLASS[cy.status]}>
      {cy.label}
    </Badge>
  );
}
