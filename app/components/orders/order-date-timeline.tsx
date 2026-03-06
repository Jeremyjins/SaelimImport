import { formatDate } from "~/lib/format";
import type { OrderDetail } from "~/types/order";

interface TimelineStep {
  label: string;
  date: string | null;
  colorClass: string;
  dotClass: string;
}

function buildSteps(order: OrderDetail): TimelineStep[] {
  return [
    {
      label: "어드바이스",
      date: order.advice_date,
      colorClass: "bg-blue-50 border-blue-200",
      dotClass: order.advice_date ? "bg-blue-500" : "bg-zinc-300",
    },
    {
      label: "출항 (ETD)",
      date: order.shipping?.etd ?? null,
      colorClass: "bg-green-50 border-green-200",
      dotClass: order.shipping?.etd ? "bg-green-500" : "bg-zinc-300",
    },
    {
      label: "도착예정 (ETA)",
      date: order.shipping?.eta ?? null,
      colorClass: "bg-green-50 border-green-200",
      dotClass: order.shipping?.eta ? "bg-green-500" : "bg-zinc-300",
    },
    {
      label: "도착",
      date: order.arrival_date,
      colorClass: "bg-amber-50 border-amber-200",
      dotClass: order.arrival_date ? "bg-amber-500" : "bg-zinc-300",
    },
    {
      label: "통관",
      date: order.customs?.customs_date ?? null,
      colorClass: "bg-amber-50 border-amber-200",
      dotClass: order.customs?.customs_date ? "bg-amber-500" : "bg-zinc-300",
    },
    {
      label: "배송",
      date: order.delivery_date,
      colorClass: "bg-zinc-50 border-zinc-200",
      dotClass: order.delivery_date ? "bg-zinc-500" : "bg-zinc-300",
    },
  ];
}

interface Props {
  order: OrderDetail;
}

export function OrderDateTimeline({ order }: Props) {
  const steps = buildSteps(order);

  return (
    <>
      {/* Desktop: 수평 */}
      <div className="hidden md:flex items-stretch gap-0">
        {steps.map((step, i) => (
          <div key={step.label} className="flex-1 flex items-center">
            <div
              className={`flex-1 border rounded-lg px-3 py-3 ${step.colorClass}`}
            >
              <p className="text-[10px] font-medium text-zinc-500 mb-1">{step.label}</p>
              <p className="text-sm font-semibold text-zinc-800 leading-tight">
                {step.date ? formatDate(step.date) : (
                  <span className="text-zinc-400 font-normal">미입력</span>
                )}
              </p>
              <div className={`mt-2 w-2 h-2 rounded-full ${step.dotClass}`} />
            </div>
            {i < steps.length - 1 && (
              <div className="w-4 flex items-center justify-center shrink-0">
                <div className="w-full h-px bg-zinc-200" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: 세로 */}
      <div className="md:hidden space-y-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex flex-col items-center w-6 shrink-0">
              <div className={`w-3 h-3 rounded-full ${step.dotClass}`} />
              {i < steps.length - 1 && (
                <div className="w-px flex-1 min-h-[16px] bg-zinc-200 mt-1" />
              )}
            </div>
            <div className={`flex-1 border rounded-lg px-3 py-2 ${step.colorClass}`}>
              <span className="text-[10px] text-zinc-500">{step.label}</span>
              <span className="ml-2 text-sm font-medium text-zinc-800">
                {step.date ? formatDate(step.date) : (
                  <span className="text-zinc-400 font-normal">미입력</span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
