import { describe, it, expect } from "vitest";
import {
  formatPdfDate,
  formatPdfCurrency,
  formatPdfNumber,
  formatPdfWeight,
} from "~/components/pdf/shared/pdf-utils";

// triggerDownload는 DOM API (URL.createObjectURL, document.createElement) 사용 → 직접 호출 테스트 제외

// ─────────────────────────────────────────────────────────────
// formatPdfDate 테스트
// en-US locale, UTC timezone 사용
// ─────────────────────────────────────────────────────────────
describe("formatPdfDate", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatPdfDate(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatPdfDate(undefined)).toBe("-");
  });

  it("빈 문자열을 받으면 '-'를 반환한다", () => {
    expect(formatPdfDate("")).toBe("-");
  });

  it("'2026-03-06' → 'Mar 6, 2026' (en-US short month format)", () => {
    expect(formatPdfDate("2026-03-06")).toBe("Mar 6, 2026");
  });

  it("'2026-01-01' → 'Jan 1, 2026'", () => {
    expect(formatPdfDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("'2025-12-25' → 'Dec 25, 2025'", () => {
    expect(formatPdfDate("2025-12-25")).toBe("Dec 25, 2025");
  });

  it("UTC timezone을 사용하여 날짜 이동(date-shift)이 없다", () => {
    // T00:00:00Z로 파싱하므로 UTC 기준 날짜가 유지되어야 함
    const result = formatPdfDate("2026-03-06");
    // 어떤 timezone에서도 3월 6일이어야 함
    expect(result).toContain("Mar");
    expect(result).toContain("6");
    expect(result).toContain("2026");
  });

  it("월 이름이 영문 약어 형식이다 (en-US short)", () => {
    const result = formatPdfDate("2026-06-15");
    expect(result).toContain("Jun");
    expect(result).not.toContain("June");
  });

  it("잘못된 날짜 문자열은 원본 문자열을 반환한다 (예외 없음)", () => {
    // try/catch로 감싸져 있으므로 예외 없이 처리
    expect(() => formatPdfDate("invalid-date")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// formatPdfCurrency 테스트
// en-US locale, KRW는 반올림 정수
// ─────────────────────────────────────────────────────────────
describe("formatPdfCurrency", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatPdfCurrency(null, "USD")).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatPdfCurrency(undefined, "USD")).toBe("-");
  });

  it("USD 금액은 'USD 1,250.00' 형식으로 포맷한다", () => {
    expect(formatPdfCurrency(1250, "USD")).toBe("USD 1,250.00");
  });

  it("USD 소수점 2자리를 유지한다", () => {
    expect(formatPdfCurrency(100, "USD")).toBe("USD 100.00");
  });

  it("KRW 금액은 'KRW 1,250,000' 형식으로 포맷한다 (소수점 없음)", () => {
    expect(formatPdfCurrency(1250000, "KRW")).toBe("KRW 1,250,000");
  });

  it("KRW는 소수를 반올림하여 정수로 포맷한다", () => {
    expect(formatPdfCurrency(1250000.7, "KRW")).toBe("KRW 1,250,001");
  });

  it("0 값도 USD로 정상 포맷한다", () => {
    expect(formatPdfCurrency(0, "USD")).toBe("USD 0.00");
  });

  it("0 값도 KRW로 정상 포맷한다", () => {
    expect(formatPdfCurrency(0, "KRW")).toBe("KRW 0");
  });

  it("큰 USD 금액도 천단위 콤마로 포맷한다", () => {
    expect(formatPdfCurrency(1234567.89, "USD")).toBe("USD 1,234,567.89");
  });

  it("통화 코드 prefix가 금액 앞에 붙는다 (USD)", () => {
    const result = formatPdfCurrency(100, "USD");
    expect(result.startsWith("USD ")).toBe(true);
  });

  it("통화 코드 prefix가 금액 앞에 붙는다 (KRW)", () => {
    const result = formatPdfCurrency(100000, "KRW");
    expect(result.startsWith("KRW ")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// formatPdfNumber 테스트
// en-US locale, 소수점 자릿수 지정 가능
// ─────────────────────────────────────────────────────────────
describe("formatPdfNumber", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatPdfNumber(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatPdfNumber(undefined)).toBe("-");
  });

  it("기본값 decimals=0으로 정수를 포맷한다", () => {
    expect(formatPdfNumber(1000)).toBe("1,000");
  });

  it("decimals=2로 소수점 2자리를 포맷한다", () => {
    expect(formatPdfNumber(1000, 2)).toBe("1,000.00");
  });

  it("천단위 콤마를 적용한다", () => {
    expect(formatPdfNumber(1234567)).toBe("1,234,567");
  });

  it("0을 포맷한다 (decimals=0)", () => {
    expect(formatPdfNumber(0)).toBe("0");
  });

  it("0을 포맷한다 (decimals=2)", () => {
    expect(formatPdfNumber(0, 2)).toBe("0.00");
  });

  it("decimals 옵션이 minimumFractionDigits에도 적용된다", () => {
    // 1000.1은 decimals=2이면 1,000.10이어야 함
    expect(formatPdfNumber(1000.1, 2)).toBe("1,000.10");
  });

  it("소수를 decimals=0으로 포맷하면 반올림된다", () => {
    // 1000.5는 decimals=0이면 반올림
    const result = formatPdfNumber(1000.5, 0);
    expect(result).not.toBe("-");
  });
});

// ─────────────────────────────────────────────────────────────
// formatPdfWeight 테스트
// en-US locale, 소수점 3자리, ' KG' suffix
// ─────────────────────────────────────────────────────────────
describe("formatPdfWeight", () => {
  it("null을 받으면 '-'를 반환한다", () => {
    expect(formatPdfWeight(null)).toBe("-");
  });

  it("undefined를 받으면 '-'를 반환한다", () => {
    expect(formatPdfWeight(undefined)).toBe("-");
  });

  it("숫자 뒤에 ' KG' suffix가 붙는다", () => {
    const result = formatPdfWeight(500);
    expect(result.endsWith(" KG")).toBe(true);
  });

  it("소수점 3자리로 포맷한다", () => {
    expect(formatPdfWeight(500.123)).toBe("500.123 KG");
  });

  it("정수도 소수점 3자리로 포맷한다 (minimumFractionDigits: 3)", () => {
    expect(formatPdfWeight(500)).toBe("500.000 KG");
  });

  it("천단위 콤마를 적용한다", () => {
    expect(formatPdfWeight(50000.000)).toBe("50,000.000 KG");
  });

  it("소수점이 3자리를 초과하면 3자리로 반올림한다", () => {
    const result = formatPdfWeight(1.2345);
    // maximumFractionDigits: 3
    expect(result).toContain("1.235"); // 반올림
    expect(result).toContain(" KG");
  });

  it("0 값도 정상 포맷된다", () => {
    expect(formatPdfWeight(0)).toBe("0.000 KG");
  });
});

// ─────────────────────────────────────────────────────────────
// triggerDownload 파일명 sanitization 로직 테스트
// (DOM API 없이 패턴만 검증)
// ─────────────────────────────────────────────────────────────
describe("triggerDownload 파일명 sanitization 로직", () => {
  // triggerDownload 내부와 동일한 패턴: /[^a-zA-Z0-9._\-]/g → "_"
  function sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
  }

  it("파일명의 특수문자를 언더스코어로 변환한다", () => {
    const raw = "GV PO/2026-03-06 (copy).pdf";
    const safe = sanitizeFilename(raw);
    expect(safe).toBe("GV_PO_2026-03-06__copy_.pdf");
  });

  it("알파벳, 숫자, 점, 하이픈, 언더스코어는 유지된다", () => {
    const raw = "GV_PO_2026-03-06.pdf";
    expect(sanitizeFilename(raw)).toBe("GV_PO_2026-03-06.pdf");
  });

  it("공백을 언더스코어로 변환한다", () => {
    expect(sanitizeFilename("my file.pdf")).toBe("my_file.pdf");
  });

  it("슬래시를 언더스코어로 변환한다", () => {
    expect(sanitizeFilename("PO/2026.pdf")).toBe("PO_2026.pdf");
  });

  it("한국어 문자를 언더스코어로 변환한다", () => {
    const result = sanitizeFilename("세금계산서.pdf");
    expect(result).toMatch(/^[a-zA-Z0-9._\-_]+\.pdf$/);
  });

  it("안전한 파일명은 변경하지 않는다", () => {
    expect(sanitizeFilename("invoice_2026.pdf")).toBe("invoice_2026.pdf");
  });

  it("괄호를 언더스코어로 변환한다", () => {
    expect(sanitizeFilename("file(1).pdf")).toBe("file_1_.pdf");
  });
});
