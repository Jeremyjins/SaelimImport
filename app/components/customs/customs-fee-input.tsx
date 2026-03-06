import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface CustomsFeeInputProps {
  /** FormData key prefix: "transport" | "customs" | "vat" | "etc" */
  prefix: string;
  label: string;
  defaultSupply?: number;
  defaultVat?: number;
  /** 변경 시 부모에 total 알림 (CustomsForm 총합계용) */
  onTotalChange?: (total: number) => void;
}

export function CustomsFeeInput({
  prefix,
  label,
  defaultSupply = 0,
  defaultVat = 0,
  onTotalChange,
}: CustomsFeeInputProps) {
  const [supply, setSupply] = useState(defaultSupply);
  const [vat, setVat] = useState(defaultVat);
  const total = Math.round((supply + vat) * 100) / 100;

  function handleSupplyChange(v: number) {
    setSupply(v);
    onTotalChange?.(Math.round((v + vat) * 100) / 100);
  }

  function handleVatChange(v: number) {
    setVat(v);
    onTotalChange?.(Math.round((supply + v) * 100) / 100);
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium text-sm">{label}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label
            htmlFor={`${prefix}_supply`}
            className="text-xs text-zinc-500"
          >
            공급가액 (원)
          </Label>
          <Input
            id={`${prefix}_supply`}
            name={`${prefix}_supply`}
            type="number"
            min={0}
            step={1}
            value={supply}
            onChange={(e) => handleSupplyChange(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${prefix}_vat`} className="text-xs text-zinc-500">
            부가세 (원)
          </Label>
          <Input
            id={`${prefix}_vat`}
            name={`${prefix}_vat`}
            type="number"
            min={0}
            step={1}
            value={vat}
            onChange={(e) => handleVatChange(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1 border-t">
        <span className="text-xs text-zinc-500">합계</span>
        <span className="text-sm font-medium">
          {new Intl.NumberFormat("ko-KR").format(total)} 원
        </span>
      </div>
    </div>
  );
}
