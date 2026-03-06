import { describe, it, expect } from "vitest";
import {
  createOrderSchema,
  updateFieldsSchema,
  linkDocumentSchema,
  unlinkDocumentSchema,
} from "~/loaders/orders.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ─────────────────────────────────────────────────────────────
// createOrderSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("createOrderSchema", () => {
  it("유효한 UUID po_id를 허용한다", () => {
    const result = createOrderSchema.safeParse({ po_id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it("po_id가 UUID가 아니면 실패한다", () => {
    const result = createOrderSchema.safeParse({ po_id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 PO를 선택하세요");
    }
  });

  it("saelim_no가 있는 경우 허용한다", () => {
    const result = createOrderSchema.safeParse({
      po_id: VALID_UUID,
      saelim_no: "SL-2026-001",
    });
    expect(result.success).toBe(true);
  });

  it("saelim_no 없어도 허용한다 (optional)", () => {
    const result = createOrderSchema.safeParse({ po_id: VALID_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.saelim_no).toBeUndefined();
    }
  });

  it("saelim_no 51자는 실패한다", () => {
    const result = createOrderSchema.safeParse({
      po_id: VALID_UUID,
      saelim_no: "A".repeat(51),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("세림번호는 50자 이내로 입력하세요");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// updateFieldsSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("updateFieldsSchema", () => {
  it("빈 객체를 허용한다 (모든 필드 optional)", () => {
    const result = updateFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("advice_date YYYY-MM-DD 형식을 허용한다", () => {
    const result = updateFieldsSchema.safeParse({ advice_date: "2026-03-06" });
    expect(result.success).toBe(true);
  });

  it("advice_date 잘못된 형식은 실패한다", () => {
    const result = updateFieldsSchema.safeParse({ advice_date: "06/03/2026" });
    expect(result.success).toBe(false);
  });

  it("advice_date 빈 문자열을 허용한다 (or(z.literal('')))", () => {
    const result = updateFieldsSchema.safeParse({ advice_date: "" });
    expect(result.success).toBe(true);
  });

  it("arrival_date YYYY-MM-DD 형식을 허용하고 빈 문자열도 허용한다", () => {
    const validDate = updateFieldsSchema.safeParse({ arrival_date: "2026-04-01" });
    expect(validDate.success).toBe(true);

    const emptyDate = updateFieldsSchema.safeParse({ arrival_date: "" });
    expect(emptyDate.success).toBe(true);

    const invalidDate = updateFieldsSchema.safeParse({ arrival_date: "2026/04/01" });
    expect(invalidDate.success).toBe(false);
  });

  it("delivery_date YYYY-MM-DD 형식을 허용하고 빈 문자열도 허용한다", () => {
    const validDate = updateFieldsSchema.safeParse({ delivery_date: "2026-05-15" });
    expect(validDate.success).toBe(true);

    const emptyDate = updateFieldsSchema.safeParse({ delivery_date: "" });
    expect(emptyDate.success).toBe(true);

    const invalidDate = updateFieldsSchema.safeParse({ delivery_date: "20260515" });
    expect(invalidDate.success).toBe(false);
  });

  it("saelim_no 50자를 허용한다", () => {
    const result = updateFieldsSchema.safeParse({
      saelim_no: "A".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it("saelim_no 51자는 실패한다", () => {
    const result = updateFieldsSchema.safeParse({
      saelim_no: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// linkDocumentSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("linkDocumentSchema", () => {
  it("doc_type: 'pi'와 유효한 doc_id UUID를 허용한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "pi",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("doc_type: 'shipping'을 허용한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "shipping",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("doc_type: 'customs'를 허용한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "customs",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("doc_type: 'delivery'를 허용한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "delivery",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("doc_type: 'po'는 실패한다 (enum에 없음)", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "po",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 서류 종류를 선택하세요");
    }
  });

  it("doc_type: 'unknown'은 실패한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "unknown",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 서류 종류를 선택하세요");
    }
  });

  it("doc_id가 UUID가 아니면 실패한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "pi",
      doc_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 서류 ID를 입력하세요");
    }
  });

  it("보안: doc_type arbitrary value injection을 차단한다", () => {
    const result = linkDocumentSchema.safeParse({
      doc_type: "orders; DROP TABLE",
      doc_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// unlinkDocumentSchema 테스트
// ─────────────────────────────────────────────────────────────
describe("unlinkDocumentSchema", () => {
  it("doc_type: 'pi'를 허용한다", () => {
    const result = unlinkDocumentSchema.safeParse({ doc_type: "pi" });
    expect(result.success).toBe(true);
  });

  it("doc_type: 'po'는 실패한다 (enum에 없음)", () => {
    const result = unlinkDocumentSchema.safeParse({ doc_type: "po" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 서류 종류를 선택하세요");
    }
  });

  it("doc_type 없으면 실패한다", () => {
    const result = unlinkDocumentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("doc_type enum 외 값은 실패한다", () => {
    const result = unlinkDocumentSchema.safeParse({ doc_type: "invoice" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("유효한 서류 종류를 선택하세요");
    }
  });
});
