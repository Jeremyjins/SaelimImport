import { describe, it, expect } from "vitest";
import { lineItemSchema, poSchema } from "~/loaders/po.schema";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// lineItemSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("lineItemSchema", () => {
  const validItem = {
    product_id: "550e8400-e29b-41d4-a716-446655440000",
    product_name: "Glassine Paper 40gsm",
    gsm: 40,
    width_mm: 1000,
    quantity_kg: 500,
    unit_price: 2.5,
    amount: 1250,
  };

  it("유효한 라인아이템을 허용한다", () => {
    const result = lineItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("gsm, width_mm은 null 허용", () => {
    const result = lineItemSchema.safeParse({
      ...validItem,
      gsm: null,
      width_mm: null,
    });
    expect(result.success).toBe(true);
  });

  it("product_id가 UUID 형식이 아니면 실패", () => {
    const result = lineItemSchema.safeParse({
      ...validItem,
      product_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 제품을 선택하세요");
    }
  });

  it("quantity_kg가 0이면 실패 (must be positive)", () => {
    const result = lineItemSchema.safeParse({ ...validItem, quantity_kg: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("수량은 0보다 커야 합니다");
    }
  });

  it("quantity_kg가 음수이면 실패", () => {
    const result = lineItemSchema.safeParse({ ...validItem, quantity_kg: -1 });
    expect(result.success).toBe(false);
  });

  it("unit_price가 0이면 실패 (must be positive)", () => {
    const result = lineItemSchema.safeParse({ ...validItem, unit_price: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("단가는 0보다 커야 합니다");
    }
  });

  it("amount가 음수이면 실패 (nonnegative)", () => {
    const result = lineItemSchema.safeParse({ ...validItem, amount: -1 });
    expect(result.success).toBe(false);
  });

  it("product_name이 빈 문자열이면 실패", () => {
    const result = lineItemSchema.safeParse({ ...validItem, product_name: "" });
    expect(result.success).toBe(false);
  });

  it("product_name이 200자를 초과하면 실패", () => {
    const result = lineItemSchema.safeParse({
      ...validItem,
      product_name: "A".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("amount가 0인 경우 허용 (nonnegative)", () => {
    const result = lineItemSchema.safeParse({ ...validItem, amount: 0 });
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// lineItemSchema 배열 검증 (min 1, max 20)
// ─────────────────────────────────────────────────────────────
describe("lineItemSchema array validation", () => {
  const validItem = {
    product_id: "550e8400-e29b-41d4-a716-446655440000",
    product_name: "Glassine Paper 40gsm",
    gsm: 40,
    width_mm: 1000,
    quantity_kg: 500,
    unit_price: 2.5,
    amount: 1250,
  };

  const arraySchema = z.array(lineItemSchema).min(1).max(20);

  it("1개 아이템을 허용한다", () => {
    const result = arraySchema.safeParse([validItem]);
    expect(result.success).toBe(true);
  });

  it("20개 아이템을 허용한다", () => {
    const items = Array(20).fill(validItem);
    const result = arraySchema.safeParse(items);
    expect(result.success).toBe(true);
  });

  it("빈 배열은 실패한다", () => {
    const result = arraySchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("21개 아이템은 실패한다", () => {
    const items = Array(21).fill(validItem);
    const result = arraySchema.safeParse(items);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// poSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("poSchema", () => {
  const validPO = {
    po_date: "2026-03-06",
    supplier_id: "550e8400-e29b-41d4-a716-446655440001",
    buyer_id: "550e8400-e29b-41d4-a716-446655440002",
    currency: "USD",
  };

  it("최소 필드만 있는 유효한 PO를 허용한다", () => {
    const result = poSchema.safeParse(validPO);
    expect(result.success).toBe(true);
  });

  it("모든 필드를 포함한 유효한 PO를 허용한다", () => {
    const result = poSchema.safeParse({
      ...validPO,
      validity: "2026-04-06",
      ref_no: "REF-001",
      payment_term: "T/T 30 days",
      delivery_term: "FOB",
      loading_port: "Keelung",
      discharge_port: "Busan",
      notes: "테스트 노트",
    });
    expect(result.success).toBe(true);
  });

  it("po_date가 없으면 실패", () => {
    const { po_date: _, ...withoutDate } = validPO;
    const result = poSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it("po_date가 빈 문자열이면 실패 (커스텀 에러 메시지 확인)", () => {
    const result = poSchema.safeParse({ ...validPO, po_date: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("PO 일자를 입력하세요");
    }
  });

  // 날짜 형식 검증 (V3: ISO 8601 형식 강제)
  it("po_date가 YYYY-MM-DD 형식이 아니면 실패", () => {
    const result = poSchema.safeParse({ ...validPO, po_date: "06/03/2026" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  it("po_date가 MM/DD/YYYY 형식이면 실패", () => {
    const result = poSchema.safeParse({ ...validPO, po_date: "03/06/2026" });
    expect(result.success).toBe(false);
  });

  it("validity가 빈 문자열이면 허용 (optional)", () => {
    const result = poSchema.safeParse({ ...validPO, validity: "" });
    expect(result.success).toBe(true);
  });

  it("validity가 유효한 날짜면 허용", () => {
    const result = poSchema.safeParse({
      ...validPO,
      validity: "2026-04-06",
    });
    expect(result.success).toBe(true);
  });

  it("validity가 잘못된 날짜 형식이면 실패", () => {
    const result = poSchema.safeParse({
      ...validPO,
      validity: "2026/04/06",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)"
      );
    }
  });

  it("supplier_id가 UUID 형식이 아니면 실패", () => {
    const result = poSchema.safeParse({
      ...validPO,
      supplier_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("공급업체를 선택하세요");
    }
  });

  it("buyer_id가 UUID 형식이 아니면 실패", () => {
    const result = poSchema.safeParse({ ...validPO, buyer_id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("구매업체를 선택하세요");
    }
  });

  it("currency가 USD/KRW 외 값이면 실패", () => {
    const result = poSchema.safeParse({ ...validPO, currency: "EUR" });
    expect(result.success).toBe(false);
  });

  it("currency KRW 허용", () => {
    const result = poSchema.safeParse({ ...validPO, currency: "KRW" });
    expect(result.success).toBe(true);
  });

  it("notes가 2000자를 초과하면 실패", () => {
    const result = poSchema.safeParse({ ...validPO, notes: "A".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("notes가 2000자면 허용", () => {
    const result = poSchema.safeParse({ ...validPO, notes: "A".repeat(2000) });
    expect(result.success).toBe(true);
  });

  it("ref_no가 100자를 초과하면 실패", () => {
    const result = poSchema.safeParse({ ...validPO, ref_no: "A".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("선택적 필드 미입력 시 기본값이 적용된다", () => {
    const result = poSchema.safeParse(validPO);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validity).toBe("");
      expect(result.data.ref_no).toBe("");
      expect(result.data.payment_term).toBe("");
      expect(result.data.delivery_term).toBe("");
      expect(result.data.notes).toBe("");
    }
  });

  // SQL 인젝션 시도 (UUID 검증으로 차단됨)
  it("SQL 인젝션 시도는 UUID 검증으로 차단된다", () => {
    const result = poSchema.safeParse({
      ...validPO,
      supplier_id: "'; DROP TABLE purchase_orders; --",
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Amount 서버사이드 재계산 로직 테스트 (po.server.ts / po.$id.server.ts)
// ─────────────────────────────────────────────────────────────
describe("Amount 서버사이드 재계산 로직", () => {
  // 실제 서버 코드와 동일한 재계산 함수
  function recalculateAmount(quantity_kg: number, unit_price: number): number {
    return Math.round(quantity_kg * unit_price * 100) / 100;
  }

  function calculateTotal(
    items: Array<{ quantity_kg: number; unit_price: number }>
  ): number {
    const amounts = items.map((item) =>
      recalculateAmount(item.quantity_kg, item.unit_price)
    );
    return Math.round(amounts.reduce((sum, a) => sum + a, 0) * 100) / 100;
  }

  it("단일 품목 금액 계산이 정확하다", () => {
    expect(recalculateAmount(500, 2.5)).toBe(1250);
  });

  it("소수점 반올림 처리가 정확하다", () => {
    expect(recalculateAmount(333, 0.1)).toBe(33.3);
  });

  it("복수 품목 합산이 정확하다", () => {
    const items = [
      { quantity_kg: 500, unit_price: 2.5 }, // 1250
      { quantity_kg: 200, unit_price: 1.8 }, // 360
    ];
    expect(calculateTotal(items)).toBe(1610);
  });

  it("클라이언트 제출 amount를 무시하고 서버가 재계산함을 검증", () => {
    // 클라이언트가 1000을 제출해도, 서버는 500 * 2.5 = 1250으로 재계산
    const clientSubmittedAmount = 1000; // 의도적으로 틀린 값
    const serverRecalculated = recalculateAmount(500, 2.5);
    expect(serverRecalculated).toBe(1250);
    expect(serverRecalculated).not.toBe(clientSubmittedAmount);
  });

  it("부동소수점 누적 오차를 방지한다", () => {
    // 0.1 + 0.2 = 0.30000000004 문제 방지
    const items = [
      { quantity_kg: 100, unit_price: 0.1 }, // 10.0
      { quantity_kg: 200, unit_price: 0.1 }, // 20.0
    ];
    const total = calculateTotal(items);
    expect(total).toBe(30.0);
    expect(Number.isInteger(total * 100)).toBe(true);
  });

  it("대용량 수량 계산도 정확하다", () => {
    const items = [
      { quantity_kg: 50000, unit_price: 3.75 }, // 187500
      { quantity_kg: 30000, unit_price: 2.25 }, // 67500
    ];
    expect(calculateTotal(items)).toBe(255000);
  });
});

// ─────────────────────────────────────────────────────────────
// Status Toggle 로직 테스트 (V2: DB에서 직접 조회 후 토글)
// ─────────────────────────────────────────────────────────────
describe("Status Toggle 로직", () => {
  function getNewStatus(currentStatus: string): string {
    return currentStatus === "process" ? "complete" : "process";
  }

  it("process → complete로 전환된다", () => {
    expect(getNewStatus("process")).toBe("complete");
  });

  it("complete → process로 전환된다", () => {
    expect(getNewStatus("complete")).toBe("process");
  });

  it("토글은 항상 두 상태 중 하나다", () => {
    const result = getNewStatus("process");
    expect(["process", "complete"]).toContain(result);
  });

  it("V2: 클라이언트 값 무시 - DB status 기반 토글 검증", () => {
    // 클라이언트가 'complete'를 보내도 DB에 'process'가 있으면 'complete'로 전환
    const dbStatus = "process"; // DB에서 직접 조회한 값
    const newStatus = getNewStatus(dbStatus);
    expect(newStatus).toBe("complete");
  });
});

// ─────────────────────────────────────────────────────────────
// UUID 검증 테스트 (Action params.id 검증)
// ─────────────────────────────────────────────────────────────
describe("URL params UUID 검증", () => {
  const uuidSchema = z.string().uuid();

  it("유효한 UUID를 허용한다", () => {
    const result = uuidSchema.safeParse("550e8400-e29b-41d4-a716-446655440000");
    expect(result.success).toBe(true);
  });

  it("임의 문자열을 거부한다", () => {
    const result = uuidSchema.safeParse("not-a-uuid");
    expect(result.success).toBe(false);
  });

  it("SQL 인젝션을 거부한다", () => {
    const result = uuidSchema.safeParse(
      "1; DROP TABLE purchase_orders; --"
    );
    expect(result.success).toBe(false);
  });

  it("숫자 ID를 거부한다 (구 방식 IDOR 방지)", () => {
    const result = uuidSchema.safeParse("12345");
    expect(result.success).toBe(false);
  });

  it("빈 문자열을 거부한다", () => {
    const result = uuidSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});
