import { describe, it, expect } from "vitest";
import { z } from "zod";

// 스키마를 직접 재정의하여 순수 로직 테스트 (server 파일의 CF 의존성 없이)
const orgSchema = z.object({
  _action: z.enum(["create", "update"]),
  id: z.string().uuid().optional(),
  type: z.enum(["supplier", "seller", "buyer"]),
  name_en: z.string().min(1, "영문명을 입력하세요"),
  name_ko: z.string().optional(),
  address_en: z.string().optional(),
  address_ko: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid("올바른 ID가 아닙니다."),
});

// ─────────────────────────────────────────────
// orgSchema 테스트
// ─────────────────────────────────────────────
describe("orgSchema", () => {
  const base = {
    _action: "create" as const,
    type: "supplier" as const,
    name_en: "Test Org",
  };

  it("유효한 create 데이터를 허용한다", () => {
    const result = orgSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("유효한 update 데이터 (id 포함)를 허용한다", () => {
    const result = orgSchema.safeParse({
      ...base,
      _action: "update",
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("_action이 잘못된 경우 실패한다", () => {
    const result = orgSchema.safeParse({ ...base, _action: "delete" });
    expect(result.success).toBe(false);
  });

  it("type이 잘못된 경우 실패한다", () => {
    const result = orgSchema.safeParse({ ...base, type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("name_en이 빈 문자열이면 실패한다", () => {
    const result = orgSchema.safeParse({ ...base, name_en: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("영문명을 입력하세요");
    }
  });

  it("id가 UUID 형식이 아니면 실패한다", () => {
    const result = orgSchema.safeParse({
      ...base,
      _action: "update",
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("선택적 필드는 undefined여도 허용한다", () => {
    const result = orgSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name_ko).toBeUndefined();
      expect(result.data.phone).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────
// deleteSchema 테스트 (S-5 보안 수정)
// ─────────────────────────────────────────────
describe("deleteSchema (S-5: UUID 검증)", () => {
  it("유효한 UUID를 허용한다", () => {
    const result = deleteSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.success).toBe(true);
  });

  it("임의 문자열을 거부한다", () => {
    const result = deleteSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("올바른 ID가 아닙니다.");
    }
  });

  it("빈 문자열을 거부한다", () => {
    const result = deleteSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });

  it("SQL 인젝션 시도를 거부한다", () => {
    const result = deleteSchema.safeParse({ id: "'; DROP TABLE organizations; --" });
    expect(result.success).toBe(false);
  });

  it("id가 없으면 실패한다", () => {
    const result = deleteSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// M-2 로직 테스트: update 시 id 필수
// ─────────────────────────────────────────────
describe("M-2: update 액션에서 id 처리", () => {
  it("update + id 있음: 정상 파싱", () => {
    const result = orgSchema.safeParse({
      _action: "update",
      type: "seller",
      name_en: "GV International",
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBeDefined();
    }
  });

  it("update + id 없음: 파싱은 성공하지만 id는 undefined", () => {
    // 스키마 자체는 id optional이므로 파싱 성공
    // 실제 서버에서 _action=update && !id → 400 반환하는 로직으로 처리
    const result = orgSchema.safeParse({
      _action: "update",
      type: "seller",
      name_en: "GV International",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBeUndefined();
    }
  });
});
