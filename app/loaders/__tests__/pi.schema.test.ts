import { describe, it, expect } from "vitest";
import { piSchema, lineItemSchema } from "~/loaders/pi.schema";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// piSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("piSchema", () => {
  const validPI = {
    pi_date: "2026-03-06",
    supplier_id: "550e8400-e29b-41d4-a716-446655440001",
    buyer_id: "550e8400-e29b-41d4-a716-446655440002",
    currency: "USD",
  };

  it("최소 필드만 있는 유효한 PI를 허용한다", () => {
    const result = piSchema.safeParse(validPI);
    expect(result.success).toBe(true);
  });

  it("모든 필드를 포함한 유효한 PI를 허용한다", () => {
    const result = piSchema.safeParse({
      ...validPI,
      validity: "2026-04-06",
      ref_no: "PI-REF-001",
      po_id: "550e8400-e29b-41d4-a716-446655440003",
      payment_term: "T/T 30 days",
      delivery_term: "FOB",
      loading_port: "Keelung",
      discharge_port: "Busan",
      notes: "테스트 노트",
    });
    expect(result.success).toBe(true);
  });

  it("pi_date가 없으면 실패", () => {
    const { pi_date: _, ...withoutDate } = validPI;
    const result = piSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it("pi_date가 빈 문자열이면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = piSchema.safeParse({ ...validPI, pi_date: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("PI 일자를 입력하세요");
    }
  });

  it("pi_date가 MM/DD/YYYY 형식이면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = piSchema.safeParse({ ...validPI, pi_date: "03/06/2026" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  it("validity가 빈 문자열이면 허용 (optional)", () => {
    const result = piSchema.safeParse({ ...validPI, validity: "" });
    expect(result.success).toBe(true);
  });

  it("validity가 유효한 날짜면 허용", () => {
    const result = piSchema.safeParse({ ...validPI, validity: "2026-04-06" });
    expect(result.success).toBe(true);
  });

  it("validity가 잘못된 날짜 형식이면 실패", () => {
    const result = piSchema.safeParse({ ...validPI, validity: "2026/04/06" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  // po_id union 타입 테스트
  it("po_id가 유효한 UUID이면 허용", () => {
    const result = piSchema.safeParse({
      ...validPI,
      po_id: "550e8400-e29b-41d4-a716-446655440003",
    });
    expect(result.success).toBe(true);
  });

  it("po_id가 빈 문자열이면 허용 (z.literal(''))", () => {
    const result = piSchema.safeParse({ ...validPI, po_id: "" });
    expect(result.success).toBe(true);
  });

  it("po_id가 undefined이면 허용 (optional)", () => {
    const result = piSchema.safeParse({ ...validPI, po_id: undefined });
    expect(result.success).toBe(true);
  });

  it("po_id가 UUID도 아니고 빈 문자열도 아니면 실패", () => {
    const result = piSchema.safeParse({ ...validPI, po_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("supplier_id가 UUID 형식이 아니면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = piSchema.safeParse({
      ...validPI,
      supplier_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("공급업체를 선택하세요");
    }
  });

  it("buyer_id가 UUID 형식이 아니면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = piSchema.safeParse({ ...validPI, buyer_id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("구매업체를 선택하세요");
    }
  });

  it("currency가 EUR이면 실패", () => {
    const result = piSchema.safeParse({ ...validPI, currency: "EUR" });
    expect(result.success).toBe(false);
  });

  it("currency KRW를 허용한다", () => {
    const result = piSchema.safeParse({ ...validPI, currency: "KRW" });
    expect(result.success).toBe(true);
  });

  it("notes가 2001자를 초과하면 실패", () => {
    const result = piSchema.safeParse({
      ...validPI,
      notes: "A".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("notes가 2000자면 허용", () => {
    const result = piSchema.safeParse({
      ...validPI,
      notes: "A".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("선택적 필드 미입력 시 기본값이 적용된다", () => {
    const result = piSchema.safeParse(validPI);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validity).toBe("");
      expect(result.data.ref_no).toBe("");
      expect(result.data.payment_term).toBe("");
      expect(result.data.delivery_term).toBe("");
      expect(result.data.loading_port).toBe("");
      expect(result.data.discharge_port).toBe("");
      expect(result.data.notes).toBe("");
    }
  });

  it("ref_no가 100자를 초과하면 실패", () => {
    const result = piSchema.safeParse({ ...validPI, ref_no: "A".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("SQL 인젝션 시도는 UUID 검증으로 차단된다", () => {
    const result = piSchema.safeParse({
      ...validPI,
      supplier_id: "'; DROP TABLE proforma_invoices; --",
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// lineItemSchema smoke test (pi.schema re-export 확인)
// ─────────────────────────────────────────────────────────────
describe("lineItemSchema (pi.schema re-export)", () => {
  const validItem = {
    product_id: "550e8400-e29b-41d4-a716-446655440000",
    product_name: "Glassine Paper 40gsm",
    gsm: 40,
    width_mm: 1000,
    quantity_kg: 500,
    unit_price: 2.5,
    amount: 1250,
  };

  it("pi.schema에서 re-export된 lineItemSchema가 유효한 아이템을 허용한다", () => {
    const result = lineItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("pi.schema re-export lineItemSchema는 필수 필드 누락 시 실패한다", () => {
    const { product_id: _, ...withoutId } = validItem;
    const result = lineItemSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it("pi.schema re-export lineItemSchema 배열 검증 (min 1)이 작동한다", () => {
    const arraySchema = z.array(lineItemSchema).min(1);
    expect(arraySchema.safeParse([validItem]).success).toBe(true);
    expect(arraySchema.safeParse([]).success).toBe(false);
  });
});
