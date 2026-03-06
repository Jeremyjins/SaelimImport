import { Link } from "react-router";
import { Card } from "~/components/ui/card";
import { AlertCircle } from "~/components/ui/icons";
import { cn } from "~/lib/utils";

interface AlertItem {
  id: string;
  label: string;
  count: number;
  to: string;
  variant: "red" | "amber" | "orange";
}

interface AlertListProps {
  items: AlertItem[];
}

const variantStyles = {
  red: {
    bg: "bg-red-50",
    dot: "bg-red-500",
    text: "text-red-800",
    count: "bg-red-100 text-red-700",
  },
  amber: {
    bg: "bg-amber-50",
    dot: "bg-amber-500",
    text: "text-amber-800",
    count: "bg-amber-100 text-amber-700",
  },
  orange: {
    bg: "bg-orange-50",
    dot: "bg-orange-500",
    text: "text-orange-800",
    count: "bg-orange-100 text-orange-700",
  },
};

export function AlertList({ items }: AlertListProps) {
  const activeItems = items.filter((item) => item.count > 0);

  return (
    <Card className="p-4 bg-white border-zinc-200">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4 w-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-zinc-900">주요 알림</h3>
      </div>
      {activeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-zinc-400">처리가 필요한 알림이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeItems.map((item) => {
            const styles = variantStyles[item.variant];
            return (
              <Link key={item.id} to={item.to} className="block">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md hover:opacity-80 transition-opacity",
                    styles.bg
                  )}
                >
                  <div className={cn("h-2 w-2 rounded-full shrink-0", styles.dot)} />
                  <span className={cn("text-sm flex-1 min-w-0", styles.text)}>{item.label}</span>
                  <span
                    className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
                      styles.count
                    )}
                  >
                    {item.count}건
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
