import { Link } from "react-router";
import { Card } from "~/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

interface StatCardProps {
  label: string;
  count: number;
  icon: LucideIcon;
  to: string;
  variant?: "default" | "warning" | "info";
}

const variantStyles = {
  default: {
    card: "bg-white border-zinc-200",
    label: "text-zinc-500",
    count: "text-zinc-900",
    icon: "text-zinc-400",
  },
  warning: {
    card: "bg-orange-50 border-orange-200",
    label: "text-orange-700",
    count: "text-orange-700",
    icon: "text-orange-500",
  },
  info: {
    card: "bg-blue-50 border-blue-200",
    label: "text-blue-700",
    count: "text-blue-700",
    icon: "text-blue-500",
  },
};

export function StatCard({ label, count, icon: Icon, to, variant = "default" }: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <Link to={to} className="block">
      <Card
        className={cn(
          "p-4 hover:shadow-sm transition-shadow cursor-pointer",
          styles.card
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("text-xs font-medium truncate", styles.label)}>{label}</p>
            <p className={cn("text-3xl font-bold mt-1 leading-none", styles.count)}>{count}</p>
          </div>
          <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", styles.icon)} />
        </div>
      </Card>
    </Link>
  );
}
