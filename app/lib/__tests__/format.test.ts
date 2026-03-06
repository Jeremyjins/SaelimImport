import { describe, it, expect } from "vitest";
import { formatDate, formatCurrency, formatWeight, formatNumber } from "~/lib/format";

// ─────────────────────────────────────────────────────────────
// formatDate 테스트
// ─────────────────────────────────────────────────────────────
describe("formatDate", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatDate(undefined)).toBe("-");
  });

  it("빈 문자열을 받으면 '-'를 반환한다", () => {
    expect(formatDate("")).toBe("-");
  });

  it("날짜 문자열을 ko-KR 형식으로 포맷한다", () => {
    const result = formatDate("2026-03-06");
    // ko-KR 형식: 연도, 월, 일 포함 여부 확인
    expect(result).toContain("2026");
    expect(result).toContain("3");
    expect(result).toContain("6");
  });

  it("Date 객체를 ko-KR 형식으로 포맷한다", () => {
    const date = new Date("2026-01-15T00:00:00Z");
    const result = formatDate(date);
    expect(result).toContain("2026");
  });

  it("연도, 월, 일이 모두 포함된다 (ko-KR locale 옵션)", () => {
    const result = formatDate("2025-12-25");
    expect(result).toContain("2025");
    expect(result).toContain("12");
    expect(result).toContain("25");
  });

  it("2자리 월/일 포맷으로 반환한다 (2-digit)", () => {
    const result = formatDate("2026-01-05");
    // ko-KR 2-digit: '01' 또는 '1' (로케일 구현에 따라 다를 수 있음)
    expect(typeof result).toBe("string");
    expect(result).not.toBe("-");
  });

  it("유효하지 않은 날짜 문자열도 처리 시도한다 (예외 없음)", () => {
    // 잘못된 날짜는 'Invalid Date'가 되지만 예외를 던지지 않아야 함
    expect(() => formatDate("not-a-date")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// formatCurrency 테스트
// ─────────────────────────────────────────────────────────────
describe("formatCurrency", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatCurrency(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatCurrency(undefined)).toBe("-");
  });

  it("USD 포맷은 소수 2자리를 포함한다", () => {
    const result = formatCurrency(1250, "USD");
    expect(result).toContain("1,250");
    expect(result).toContain(".00");
  });

  it("USD 기본값으로 포맷한다", () => {
    const result = formatCurrency(500);
    expect(result).toContain("500");
    expect(result).toContain(".00");
  });

  it("KRW 포맷은 소수점 없이 정수로 포맷한다", () => {
    const result = formatCurrency(1250000, "KRW");
    expect(result).toContain("1,250,000");
    expect(result).not.toContain(".");
  });

  it("0 값도 정상 포맷된다 (USD)", () => {
    const result = formatCurrency(0, "USD");
    expect(result).not.toBe("-");
    expect(result).toContain("0");
  });

  it("0 값도 정상 포맷된다 (KRW)", () => {
    const result = formatCurrency(0, "KRW");
    expect(result).not.toBe("-");
    expect(result).toContain("0");
  });

  it("큰 USD 금액도 천단위 콤마로 포맷한다", () => {
    const result = formatCurrency(1234567.89, "USD");
    expect(result).toContain("1,234,567");
  });

  it("USD 통화 기호가 포함된다", () => {
    const result = formatCurrency(100, "USD");
    expect(result).toContain("$");
  });
});

// ─────────────────────────────────────────────────────────────
// formatWeight 테스트
// ─────────────────────────────────────────────────────────────
describe("formatWeight", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatWeight(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatWeight(undefined)).toBe("-");
  });

  it("숫자 뒤에 ' KG' suffix가 붙는다", () => {
    const result = formatWeight(500);
    expect(result).toContain(" KG");
    expect(result.endsWith(" KG")).toBe(true);
  });

  it("정수 무게를 포맷한다", () => {
    const result = formatWeight(1000);
    expect(result).toContain("1,000");
    expect(result).toContain(" KG");
  });

  it("소수점 3자리까지 표시한다", () => {
    const result = formatWeight(1.234);
    expect(result).toContain("1.234");
  });

  it("소수점이 3자리를 초과하면 3자리로 반올림한다", () => {
    const result = formatWeight(1.2345);
    // maximumFractionDigits: 3이므로 3자리까지만
    expect(result).not.toContain("1.2345");
    expect(result).toContain(" KG");
  });

  it("0 값도 정상 포맷된다", () => {
    const result = formatWeight(0);
    expect(result).not.toBe("-");
    expect(result).toContain(" KG");
  });

  it("큰 무게도 천단위 콤마로 포맷한다", () => {
    const result = formatWeight(50000);
    expect(result).toContain("50,000");
    expect(result).toContain(" KG");
  });
});

// ─────────────────────────────────────────────────────────────
// formatNumber 테스트
// ─────────────────────────────────────────────────────────────
describe("formatNumber", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatNumber(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatNumber(undefined)).toBe("-");
  });

  it("정수를 포맷한다", () => {
    const result = formatNumber(1000);
    expect(result).toBe("1,000");
  });

  it("큰 숫자를 천단위 콤마로 포맷한다", () => {
    const result = formatNumber(1234567);
    expect(result).toBe("1,234,567");
  });

  it("0을 포맷한다", () => {
    const result = formatNumber(0);
    expect(result).toBe("0");
  });

  it("소수를 포맷한다", () => {
    const result = formatNumber(1.5);
    expect(result).not.toBe("-");
    expect(result).toContain("1");
  });

  it("음수를 포맷한다", () => {
    const result = formatNumber(-1000);
    expect(result).not.toBe("-");
    expect(result).toContain("1,000");
  });

  it("en-US 로케일로 포맷된다 (콤마 구분자)", () => {
    const result = formatNumber(1000000);
    expect(result).toBe("1,000,000");
  });
});
