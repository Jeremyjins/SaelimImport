import { describe, it, expect } from "vitest";
import { z } from "zod";

// S-4: z.preprocess 패턴 - 서버 파일과 동일한 스키마 정의
const optionalPositiveInt = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional()
);

const productSchema = z.object({
  _action: z.enum(["create", "update"]),
  id: z.string().uuid().optional(),
  name: z.string().min(1, "제품명을 입력하세요"),
  gsm: optionalPositiveInt,
  width_mm: optionalPositiveInt,
  hs_code: z.string().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid("올바른 ID가 아닙니다."),
});

// ─────────────────────────────────────────────
// productSchema 테스트
// ─────────────────────────────────────────────
describe("productSchema", () => {
  const base = {
    _action: "create" as const,
    name: "Glassine 40gsm",
  };

  it("최소 유효 데이터를 허용한다", () => {
    const result = productSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("전체 필드를 포함한 유효 데이터를 허용한다", () => {
    const result = productSchema.safeParse({
      ...base,
      gsm: "40",
      width_mm: "1000",
      hs_code: "4806.40-0000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gsm).toBe(40);
      expect(result.data.width_mm).toBe(1000);
    }
  });

  it("name이 비어있으면 실패한다", () => {
    const result = productSchema.safeParse({ ...base, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("제품명을 입력하세요");
    }
  });
});

// ─────────────────────────────────────────────
// S-4: optionalPositiveInt (z.preprocess) 테스트
// ─────────────────────────────────────────────
describe("S-4: optionalPositiveInt preprocess", () => {
  it("빈 문자열('')을 undefined로 처리한다", () => {
    const result = optionalPositiveInt.parse("");
    expect(result).toBeUndefined();
  });

  it("undefined를 undefined로 처리한다", () => {
    const result = optionalPositiveInt.parse(undefined);
    expect(result).toBeUndefined();
  });

  it("숫자 문자열을 number로 변환한다", () => {
    const result = optionalPositiveInt.parse("40");
    expect(result).toBe(40);
  });

  it("숫자를 그대로 허용한다", () => {
    const result = optionalPositiveInt.parse(40);
    expect(result).toBe(40);
  });

  it("0 이하의 값을 거부한다", () => {
    const schema = z.object({ gsm: optionalPositiveInt });
    const result = schema.safeParse({ gsm: "0" });
    expect(result.success).toBe(false);
  });

  it("음수를 거부한다", () => {
    const schema = z.object({ gsm: optionalPositiveInt });
    const result = schema.safeParse({ gsm: "-5" });
    expect(result.success).toBe(false);
  });

  it("소수점을 거부한다 (int 제약)", () => {
    const schema = z.object({ gsm: optionalPositiveInt });
    const result = schema.safeParse({ gsm: "40.5" });
    expect(result.success).toBe(false);
  });

  it("FormData 빈 입력 시나리오: 빈 gsm, 빈 width_mm", () => {
    const result = productSchema.safeParse({
      _action: "create",
      name: "Test",
      gsm: "",
      width_mm: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gsm).toBeUndefined();
      expect(result.data.width_mm).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────
// deleteSchema 테스트 (S-5)
// ─────────────────────────────────────────────
describe("deleteSchema (S-5: UUID 검증)", () => {
  it("유효한 UUID를 허용한다", () => {
    const result = deleteSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.success).toBe(true);
  });

  it("임의 문자열을 거부한다", () => {
    const result = deleteSchema.safeParse({ id: "invalid" });
    expect(result.success).toBe(false);
  });

  it("SQL 인젝션을 거부한다", () => {
    const result = deleteSchema.safeParse({ id: "' OR '1'='1" });
    expect(result.success).toBe(false);
  });
});
