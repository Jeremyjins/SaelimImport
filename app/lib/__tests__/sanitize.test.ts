import { describe, it, expect } from "vitest";
import { sanitizeFormulaInjection } from "~/lib/sanitize";

// ─────────────────────────────────────────────────────────────
// sanitizeFormulaInjection 테스트
// 스프레드시트/PDF 수식 인젝션 방지: 선행 =+\-@ 제거
// ─────────────────────────────────────────────────────────────
describe("sanitizeFormulaInjection", () => {
  it("'='로 시작하는 문자열에서 '='를 제거한다", () => {
    expect(sanitizeFormulaInjection("=SUM(A1)")).toBe("SUM(A1)");
  });

  it("'+'로 시작하는 문자열에서 '+'를 제거한다", () => {
    expect(sanitizeFormulaInjection("+cmd")).toBe("cmd");
  });

  it("'-'로 시작하는 문자열에서 '-'를 제거한다", () => {
    expect(sanitizeFormulaInjection("-1+1")).toBe("1+1");
  });

  it("'@'로 시작하는 문자열에서 '@'를 제거한다", () => {
    expect(sanitizeFormulaInjection("@SUM")).toBe("SUM");
  });

  it("안전한 문자열은 변경하지 않는다", () => {
    expect(sanitizeFormulaInjection("Glassine Paper")).toBe("Glassine Paper");
  });

  it("빈 문자열은 빈 문자열을 반환한다", () => {
    expect(sanitizeFormulaInjection("")).toBe("");
  });

  it("중간에 있는 '='는 제거하지 않는다 (선행 문자만 처리)", () => {
    expect(sanitizeFormulaInjection("price=100")).toBe("price=100");
  });

  it("유니코드 안전 문자열은 변경하지 않는다", () => {
    expect(sanitizeFormulaInjection("유리지 페이퍼 40gsm")).toBe("유리지 페이퍼 40gsm");
  });

  it("'='로 시작하는 셀 참조 수식을 무력화한다", () => {
    expect(sanitizeFormulaInjection("=A1+B1")).toBe("A1+B1");
  });

  it("'-'로 시작하는 부정 수식을 무력화한다", () => {
    expect(sanitizeFormulaInjection("-2+3")).toBe("2+3");
  });

  it("숫자로 시작하는 문자열은 변경하지 않는다", () => {
    expect(sanitizeFormulaInjection("123abc")).toBe("123abc");
  });

  it("공백으로 시작하는 문자열은 변경하지 않는다", () => {
    expect(sanitizeFormulaInjection(" =SUM(A1)")).toBe(" =SUM(A1)");
  });

  it("한 번만 제거한다 (중첩 인젝션 주의)", () => {
    // '=='로 시작하면 첫 번째 '='만 제거됨 (replace 1회)
    expect(sanitizeFormulaInjection("==SUM()")).toBe("=SUM()");
  });

  it("영숫자 혼합 일반 데이터는 변경하지 않는다", () => {
    expect(sanitizeFormulaInjection("GVPO2026-001")).toBe("GVPO2026-001");
  });
});
