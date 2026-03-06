import { describe, it, expect } from "vitest";
import { customsCreateSchema, customsUpdateSchema } from "~/loaders/customs.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ─────────────────────────────────────────────────────────────
// customsCreateSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("customsCreateSchema", () => {
  const validBase = {
    shipping_doc_id: VALID_UUID,
  };

  it("유효한 UUID shipping_doc_id를 허용한다", () => {
    const result = customsCreateSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("shipping_doc_id가 UUID가 아니면 실패한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      shipping_doc_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 선적서류를 선택하세요");
    }
  });

  it("shipping_doc_id가 없으면 실패한다", () => {
    const result = customsCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("fee 필드에 문자열을 전달하면 숫자로 coerce한다 (transport_supply)", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      transport_supply: "100000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transport_supply).toBe(100000);
    }
  });

  it("fee 필드 미입력 시 기본값 0이 적용된다", () => {
    const result = customsCreateSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transport_supply).toBe(0);
      expect(result.data.transport_vat).toBe(0);
      expect(result.data.customs_supply).toBe(0);
      expect(result.data.customs_vat).toBe(0);
      expect(result.data.vat_supply).toBe(0);
      expect(result.data.vat_vat).toBe(0);
      expect(result.data.etc_supply).toBe(0);
      expect(result.data.etc_vat).toBe(0);
    }
  });

  it("MAX_FEE (999_000_000) 이하 fee를 허용한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      transport_supply: 999_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("MAX_FEE (999_000_000) 초과 fee는 실패한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      transport_supply: 999_000_001,
    });
    expect(result.success).toBe(false);
  });

  it("유효한 YYYY-MM-DD 형식의 customs_date를 허용한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      customs_date: "2026-03-06",
    });
    expect(result.success).toBe(true);
  });

  it("잘못된 형식의 customs_date는 실패한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      customs_date: "06/03/2026",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 날짜 형식이 아닙니다.");
    }
  });

  it("customs_date 빈 문자열을 허용한다 (or(z.literal('')))", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      customs_date: "",
    });
    expect(result.success).toBe(true);
  });

  it("customs_no 50자 이내를 허용한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      customs_no: "A".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it("customs_no 51자는 실패한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      customs_no: "A".repeat(51),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("통관번호는 50자 이내로 입력하세요");
    }
  });

  it("etc_desc 500자 이내를 허용한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      etc_desc: "A".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("etc_desc 501자는 실패한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      etc_desc: "A".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("비용 설명은 500자 이내로 입력하세요");
    }
  });

  it("모든 fee 필드에 문자열을 전달하면 각각 숫자로 coerce한다", () => {
    const result = customsCreateSchema.safeParse({
      ...validBase,
      transport_supply: "10000",
      transport_vat: "1000",
      customs_supply: "20000",
      customs_vat: "2000",
      vat_supply: "30000",
      vat_vat: "3000",
      etc_supply: "5000",
      etc_vat: "500",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transport_supply).toBe(10000);
      expect(result.data.customs_vat).toBe(2000);
      expect(result.data.etc_vat).toBe(500);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// customsUpdateSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("customsUpdateSchema", () => {
  it("빈 객체도 허용한다 (모든 필드 optional + default)", () => {
    const result = customsUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("shipping_doc_id 없어도 허용한다 (update에는 id 불필요)", () => {
    const result = customsUpdateSchema.safeParse({
      customs_no: "12345",
    });
    expect(result.success).toBe(true);
  });

  it("fee 필드들에 문자열을 전달하면 coerce가 작동한다", () => {
    const result = customsUpdateSchema.safeParse({
      transport_supply: "50000",
      customs_supply: "80000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transport_supply).toBe(50000);
      expect(result.data.customs_supply).toBe(80000);
    }
  });

  it("customs_date 빈 문자열을 허용한다", () => {
    const result = customsUpdateSchema.safeParse({
      customs_date: "",
    });
    expect(result.success).toBe(true);
  });

  it("유효한 날짜와 fee를 함께 전달하면 허용한다", () => {
    const result = customsUpdateSchema.safeParse({
      customs_date: "2026-03-06",
      transport_supply: 50000,
      customs_no: "CUST-001",
    });
    expect(result.success).toBe(true);
  });
});
