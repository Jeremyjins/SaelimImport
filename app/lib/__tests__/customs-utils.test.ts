import { describe, it, expect } from "vitest";
import { calcTotalFees, computeFeeTotal } from "~/lib/customs-utils";
import type { FeeBreakdown } from "~/types/customs";

// ─────────────────────────────────────────────────────────────
// computeFeeTotal 테스트
// supply + vat 합산, KRW 정수 반올림
// ─────────────────────────────────────────────────────────────
describe("computeFeeTotal", () => {
  it("supply와 vat의 합산을 반환한다", () => {
    expect(computeFeeTotal(100000, 10000)).toBe(110000);
  });

  it("소수 입력을 정수로 반올림한다 (Math.round)", () => {
    expect(computeFeeTotal(100000.5, 9999.7)).toBe(110000);
  });

  it("0 값도 정상 처리된다", () => {
    expect(computeFeeTotal(0, 0)).toBe(0);
  });

  it("supply만 있고 vat가 0이면 supply를 반환한다", () => {
    expect(computeFeeTotal(500000, 0)).toBe(500000);
  });

  it("반올림 경계값: 0.5는 1로 올림된다", () => {
    expect(computeFeeTotal(0.5, 0)).toBe(1);
  });

  it("반올림 경계값: 0.4는 0으로 내림된다", () => {
    expect(computeFeeTotal(0.4, 0)).toBe(0);
  });

  it("큰 금액의 합산도 정확하다 (KRW 단위)", () => {
    expect(computeFeeTotal(1000000, 100000)).toBe(1100000);
  });

  it("결과가 항상 정수다", () => {
    const result = computeFeeTotal(123456.789, 12345.678);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// calcTotalFees 테스트
// 4개 fee JSONB 합산 → { totalSupply, totalVat, grandTotal }
// ─────────────────────────────────────────────────────────────
describe("calcTotalFees", () => {
  const transportFee: FeeBreakdown = { supply: 100000, vat: 10000, total: 110000 };
  const customsFee: FeeBreakdown = { supply: 200000, vat: 20000, total: 220000 };
  const vatFee: FeeBreakdown = { supply: 50000, vat: 5000, total: 55000 };
  const etcFee: FeeBreakdown = { supply: 30000, vat: 3000, total: 33000 };

  it("모든 fee가 null이면 모든 합계가 0을 반환한다", () => {
    const result = calcTotalFees(null, null, null, null);
    expect(result).toEqual({ totalSupply: 0, totalVat: 0, grandTotal: 0 });
  });

  it("일부 fee가 null이어도 null-safe하게 처리한다", () => {
    const result = calcTotalFees(transportFee, null, null, null);
    expect(result.totalSupply).toBe(100000);
    expect(result.totalVat).toBe(10000);
    expect(result.grandTotal).toBe(110000);
  });

  it("두 개의 fee만 있을 때 합산이 정확하다", () => {
    const result = calcTotalFees(transportFee, customsFee, null, null);
    expect(result.totalSupply).toBe(300000);
    expect(result.totalVat).toBe(30000);
    expect(result.grandTotal).toBe(330000);
  });

  it("4개 fee 모두 있을 때 totalSupply를 정확히 합산한다", () => {
    const result = calcTotalFees(transportFee, customsFee, vatFee, etcFee);
    expect(result.totalSupply).toBe(380000); // 100000+200000+50000+30000
  });

  it("4개 fee 모두 있을 때 totalVat를 정확히 합산한다", () => {
    const result = calcTotalFees(transportFee, customsFee, vatFee, etcFee);
    expect(result.totalVat).toBe(38000); // 10000+20000+5000+3000
  });

  it("4개 fee 모두 있을 때 grandTotal을 정확히 합산한다", () => {
    const result = calcTotalFees(transportFee, customsFee, vatFee, etcFee);
    expect(result.grandTotal).toBe(418000); // 110000+220000+55000+33000
  });

  it("totalSupply, totalVat, grandTotal이 각각 독립적으로 fee 필드를 합산한다", () => {
    const result = calcTotalFees(transportFee, customsFee, vatFee, etcFee);
    // 각 합계는 해당 JSONB 필드(supply/vat/total)를 독립적으로 합산한 결과
    expect(result.totalSupply).toBe(380000); // fee.supply 합
    expect(result.totalVat).toBe(38000);     // fee.vat 합
    expect(result.grandTotal).toBe(418000);  // fee.total 합 (별도 필드)
  });

  it("etcFee만 있을 때 정확히 처리한다", () => {
    const result = calcTotalFees(null, null, null, etcFee);
    expect(result.totalSupply).toBe(30000);
    expect(result.totalVat).toBe(3000);
    expect(result.grandTotal).toBe(33000);
  });

  it("반환 객체가 올바른 키를 포함한다", () => {
    const result = calcTotalFees(null, null, null, null);
    expect(result).toHaveProperty("totalSupply");
    expect(result).toHaveProperty("totalVat");
    expect(result).toHaveProperty("grandTotal");
  });

  it("0 값의 fee를 포함해도 정상 처리된다", () => {
    const zeroFee: FeeBreakdown = { supply: 0, vat: 0, total: 0 };
    const result = calcTotalFees(zeroFee, null, null, null);
    expect(result).toEqual({ totalSupply: 0, totalVat: 0, grandTotal: 0 });
  });
});
