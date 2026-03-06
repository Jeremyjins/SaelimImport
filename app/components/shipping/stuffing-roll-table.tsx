import type { StuffingRollDetail } from "~/types/shipping";

interface StuffingRollTableProps {
  rolls: StuffingRollDetail[];
}

function formatNum(n: number, decimals = 2) {
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function StuffingRollTable({ rolls }: StuffingRollTableProps) {
  if (rolls.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-zinc-400">
        등록된 롤이 없습니다.
      </div>
    );
  }

  const totalNet = rolls.reduce((s, r) => s + r.net_weight_kg, 0);
  const totalGross = rolls.reduce((s, r) => s + r.gross_weight_kg, 0);

  return (
    <>
      {/* Desktop 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-zinc-500">
              <th className="px-3 py-2 text-left font-medium w-12">#</th>
              <th className="px-3 py-2 text-left font-medium">품목</th>
              <th className="px-3 py-2 text-right font-medium w-16">GSM</th>
              <th className="px-3 py-2 text-right font-medium w-20">폭 (mm)</th>
              <th className="px-3 py-2 text-right font-medium w-24">길이 (m)</th>
              <th className="px-3 py-2 text-right font-medium w-28">순중량 (KG)</th>
              <th className="px-3 py-2 text-right font-medium w-28">총중량 (KG)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rolls.map((roll) => (
              <tr key={roll.roll_no} className="hover:bg-zinc-50">
                <td className="px-3 py-2 tabular-nums text-zinc-500">{roll.roll_no}</td>
                <td className="px-3 py-2 font-medium">{roll.product_name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{roll.gsm}</td>
                <td className="px-3 py-2 text-right tabular-nums">{roll.width_mm.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{roll.length_m.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNum(roll.net_weight_kg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNum(roll.gross_weight_kg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-zinc-50 font-medium text-xs">
              <td colSpan={5} className="px-3 py-2 text-right text-zinc-500">
                합계 ({rolls.length}롤)
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNum(totalNet)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNum(totalGross)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile 카드 */}
      <div className="md:hidden flex flex-col divide-y">
        {rolls.map((roll) => (
          <div key={roll.roll_no} className="p-3">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium">
                #{roll.roll_no} {roll.product_name}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatNum(roll.gross_weight_kg)} KG
              </span>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {roll.gsm}gsm, {roll.width_mm.toLocaleString()}mm | {roll.length_m.toLocaleString()}m
            </div>
            <div className="text-xs text-zinc-400">
              순중량: {formatNum(roll.net_weight_kg)} KG
            </div>
          </div>
        ))}
        <div className="px-3 py-2 bg-zinc-50 text-xs font-medium flex justify-between">
          <span>합계 ({rolls.length}롤)</span>
          <span>순중량: {formatNum(totalNet)} / 총중량: {formatNum(totalGross)} KG</span>
        </div>
      </div>
    </>
  );
}
