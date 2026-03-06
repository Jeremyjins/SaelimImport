import { describe, it, expect } from "vitest";
import {
  shippingSchema,
  stuffingRollSchema,
  stuffingListSchema,
} from "~/loaders/shipping.schema";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// stuffingRollSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("stuffingRollSchema", () => {
  const validRoll = {
    roll_no: 1,
    product_name: "Glassine Paper 40gsm",
    gsm: 40.0,
    width_mm: 1000,
    length_m: 5000,
    net_weight_kg: 100.5,
    gross_weight_kg: 105.0,
  };

  it("유효한 roll을 허용한다", () => {
    const result = stuffingRollSchema.safeParse(validRoll);
    expect(result.success).toBe(true);
  });

  it("roll_no가 0이면 실패 (must be positive)", () => {
    const result = stuffingRollSchema.safeParse({ ...validRoll, roll_no: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "롤 번호는 양의 정수여야 합니다"
      );
    }
  });

  it("roll_no가 음수이면 실패", () => {
    const result = stuffingRollSchema.safeParse({ ...validRoll, roll_no: -1 });
    expect(result.success).toBe(false);
  });

  it("product_name이 빈 문자열이면 실패", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("품목명은 필수입니다");
    }
  });

  it("product_name이 200자를 초과하면 실패", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "A".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("gsm이 0이면 실패 (must be positive)", () => {
    const result = stuffingRollSchema.safeParse({ ...validRoll, gsm: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("GSM은 양수여야 합니다");
    }
  });

  it("net_weight_kg가 음수이면 실패", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      net_weight_kg: -1,
    });
    expect(result.success).toBe(false);
  });

  it("gross_weight_kg가 음수이면 실패", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      gross_weight_kg: -0.1,
    });
    expect(result.success).toBe(false);
  });

  // Formula injection 방지 테스트
  it("product_name이 '=SUM(A1)' 이면 파싱 성공하고 선행 '='이 제거된다", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "=SUM(A1)",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_name).toBe("SUM(A1)");
    }
  });

  it("product_name이 '+malicious' 이면 파싱 성공하고 선행 '+'이 제거된다", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "+malicious",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_name).toBe("malicious");
    }
  });

  it("product_name이 '@cmd' 이면 파싱 성공하고 선행 '@'이 제거된다", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "@cmd",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_name).toBe("cmd");
    }
  });

  it("product_name이 '-formula' 이면 파싱 성공하고 선행 '-'이 제거된다", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "-formula",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_name).toBe("formula");
    }
  });

  it("product_name이 일반 문자로 시작하면 sanitize 없이 그대로 유지된다", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      product_name: "Glassine Paper 60gsm",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_name).toBe("Glassine Paper 60gsm");
    }
  });

  it("z.coerce.number()로 문자열 숫자도 변환된다", () => {
    const result = stuffingRollSchema.safeParse({
      ...validRoll,
      roll_no: "5",
      gsm: "40.5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roll_no).toBe(5);
      expect(result.data.gsm).toBe(40.5);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// stuffingListSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("stuffingListSchema", () => {
  it("빈 객체를 허용한다 (모든 필드 optional)", () => {
    const result = stuffingListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sl_no).toBe("");
      expect(result.data.cntr_no).toBe("");
      expect(result.data.seal_no).toBe("");
      expect(result.data.roll_no_range).toBe("");
    }
  });

  it("sl_no가 있는 경우 허용한다", () => {
    const result = stuffingListSchema.safeParse({
      sl_no: "SL-2026-001",
      cntr_no: "TCKU1234567",
      seal_no: "SEAL-999",
      roll_no_range: "1-50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sl_no).toBe("SL-2026-001");
    }
  });

  it("sl_no가 '=HYPERLINK(...)' 이면 파싱 성공하고 선행 '='이 제거된다", () => {
    const result = stuffingListSchema.safeParse({
      sl_no: "=HYPERLINK(\"http://evil.com\")",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sl_no).toBe("HYPERLINK(\"http://evil.com\")");
    }
  });

  it("cntr_no가 '+malicious' 이면 파싱 성공하고 선행 '+'이 제거된다", () => {
    const result = stuffingListSchema.safeParse({ cntr_no: "+malicious" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cntr_no).toBe("malicious");
    }
  });

  it("seal_no가 '@attack' 이면 파싱 성공하고 선행 '@'이 제거된다", () => {
    const result = stuffingListSchema.safeParse({ seal_no: "@attack" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seal_no).toBe("attack");
    }
  });

  it("sl_no가 50자를 초과하면 실패", () => {
    const result = stuffingListSchema.safeParse({ sl_no: "A".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("cntr_no가 20자를 초과하면 실패", () => {
    const result = stuffingListSchema.safeParse({ cntr_no: "A".repeat(21) });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// shippingSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("shippingSchema", () => {
  const validShipping = {
    ci_date: "2026-03-06",
    shipper_id: "550e8400-e29b-41d4-a716-446655440001",
    consignee_id: "550e8400-e29b-41d4-a716-446655440002",
    currency: "USD",
  };

  it("최소 필드만 있는 유효한 Shipping을 허용한다", () => {
    const result = shippingSchema.safeParse(validShipping);
    expect(result.success).toBe(true);
  });

  it("모든 필드를 포함한 유효한 Shipping을 허용한다", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      ship_date: "2026-03-10",
      ref_no: "CI-REF-001",
      pi_id: "550e8400-e29b-41d4-a716-446655440003",
      payment_term: "T/T 30 days",
      delivery_term: "FOB",
      loading_port: "Keelung",
      discharge_port: "Busan",
      vessel: "EVER GIVEN",
      voyage: "0001E",
      etd: "2026-03-12",
      eta: "2026-03-18",
      gross_weight: 5000,
      net_weight: 4800,
      package_no: 100,
      notes: "운송 메모",
    });
    expect(result.success).toBe(true);
  });

  it("ci_date가 없으면 실패 (커스텀 에러 메시지 확인)", () => {
    const { ci_date: _, ...withoutDate } = validShipping;
    const result = shippingSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it("ci_date가 빈 문자열이면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = shippingSchema.safeParse({ ...validShipping, ci_date: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("CI 일자를 입력하세요");
    }
  });

  it("ci_date가 잘못된 형식이면 실패", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      ci_date: "03/06/2026",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  it("ship_date가 빈 문자열이면 허용 (optional)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      ship_date: "",
    });
    expect(result.success).toBe(true);
  });

  it("ship_date가 잘못된 형식이면 실패", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      ship_date: "2026/03/10",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  // pi_id union 타입 테스트
  it("pi_id가 유효한 UUID이면 허용", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      pi_id: "550e8400-e29b-41d4-a716-446655440003",
    });
    expect(result.success).toBe(true);
  });

  it("pi_id가 빈 문자열이면 허용 (z.literal(''))", () => {
    const result = shippingSchema.safeParse({ ...validShipping, pi_id: "" });
    expect(result.success).toBe(true);
  });

  it("pi_id가 '__none__'이면 허용 (z.literal('__none__'))", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      pi_id: "__none__",
    });
    expect(result.success).toBe(true);
  });

  it("pi_id가 UUID/빈문자열/__none__ 외 값이면 실패", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      pi_id: "invalid-value",
    });
    expect(result.success).toBe(false);
  });

  it("pi_id가 undefined이면 허용 (optional)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      pi_id: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("etd가 빈 문자열이면 허용 (optional)", () => {
    const result = shippingSchema.safeParse({ ...validShipping, etd: "" });
    expect(result.success).toBe(true);
  });

  it("eta가 빈 문자열이면 허용 (optional)", () => {
    const result = shippingSchema.safeParse({ ...validShipping, eta: "" });
    expect(result.success).toBe(true);
  });

  it("etd가 잘못된 형식이면 실패", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      etd: "2026/03/12",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  it("eta가 잘못된 형식이면 실패", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      eta: "18-03-2026",
    });
    expect(result.success).toBe(false);
  });

  it("gross_weight가 음수이면 실패 (nonnegative)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      gross_weight: -1,
    });
    expect(result.success).toBe(false);
  });

  it("gross_weight가 0이면 허용 (nonnegative)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      gross_weight: 0,
    });
    expect(result.success).toBe(true);
  });

  it("net_weight가 음수이면 실패 (nonnegative)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      net_weight: -0.5,
    });
    expect(result.success).toBe(false);
  });

  it("package_no가 음수이면 실패 (nonnegative)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      package_no: -1,
    });
    expect(result.success).toBe(false);
  });

  it("package_no가 0이면 허용 (nonnegative)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      package_no: 0,
    });
    expect(result.success).toBe(true);
  });

  it("shipper_id가 UUID 형식이 아니면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      shipper_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("송하인을 선택하세요");
    }
  });

  it("consignee_id가 UUID 형식이 아니면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      consignee_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("수하인을 선택하세요");
    }
  });

  it("currency가 EUR이면 실패", () => {
    const result = shippingSchema.safeParse({ ...validShipping, currency: "EUR" });
    expect(result.success).toBe(false);
  });

  it("currency KRW를 허용한다", () => {
    const result = shippingSchema.safeParse({ ...validShipping, currency: "KRW" });
    expect(result.success).toBe(true);
  });

  it("notes가 2001자를 초과하면 실패", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      notes: "A".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("선택적 필드 미입력 시 기본값이 적용된다", () => {
    const result = shippingSchema.safeParse(validShipping);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ref_no).toBe("");
      expect(result.data.ship_date).toBe("");
      expect(result.data.payment_term).toBe("");
      expect(result.data.delivery_term).toBe("");
      expect(result.data.loading_port).toBe("");
      expect(result.data.discharge_port).toBe("");
      expect(result.data.vessel).toBe("");
      expect(result.data.voyage).toBe("");
      expect(result.data.etd).toBe("");
      expect(result.data.eta).toBe("");
      expect(result.data.notes).toBe("");
    }
  });

  it("SQL 인젝션 시도는 UUID 검증으로 차단된다", () => {
    const result = shippingSchema.safeParse({
      ...validShipping,
      shipper_id: "'; DROP TABLE shipping_documents; --",
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// URL params UUID 검증 (shippingSchema 관련 액션 params)
// ─────────────────────────────────────────────────────────────
describe("URL params UUID 검증 (shipping)", () => {
  const uuidSchema = z.string().uuid();

  it("유효한 UUID를 허용한다", () => {
    const result = uuidSchema.safeParse("550e8400-e29b-41d4-a716-446655440000");
    expect(result.success).toBe(true);
  });

  it("임의 문자열을 거부한다", () => {
    const result = uuidSchema.safeParse("not-a-uuid");
    expect(result.success).toBe(false);
  });

  it("숫자 ID를 거부한다 (구 방식 IDOR 방지)", () => {
    const result = uuidSchema.safeParse("12345");
    expect(result.success).toBe(false);
  });
});
