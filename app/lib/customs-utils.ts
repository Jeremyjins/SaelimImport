import type { FeeBreakdown } from "~/types/customs";

export interface TotalFees {
  totalSupply: number;
  totalVat: number;
  grandTotal: number;
}

/** 4개 fee JSONB 합산 → { totalSupply, totalVat, grandTotal } */
export function calcTotalFees(
  transport: FeeBreakdown | null,
  customs: FeeBreakdown | null,
  vat: FeeBreakdown | null,
  etc: FeeBreakdown | null
): TotalFees {
  const fees = [transport, customs, vat, etc];
  const totalSupply = fees.reduce((sum, f) => sum + (f?.supply ?? 0), 0);
  const totalVat = fees.reduce((sum, f) => sum + (f?.vat ?? 0), 0);
  const grandTotal = fees.reduce((sum, f) => sum + (f?.total ?? 0), 0);
  return { totalSupply, totalVat, grandTotal };
}

/** 서버사이드 fee total 재계산 (supply + vat, KRW 정수 반올림) */
export function computeFeeTotal(supply: number, vat: number): number {
  return Math.round(supply + vat);
}
