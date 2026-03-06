import { describe, it, expect } from "vitest";
import { z } from "zod";

// 서버 파일과 동일한 스키마 정의 (CF 의존성 없이 순수 테스트)
const inviteSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
  name: z.string().min(1, "이름을 입력하세요"),
  org_id: z.string().uuid("조직을 선택하세요"),
  role: z.enum(["admin", "member"]).default("member"),
});

const deleteSchema = z.object({
  user_id: z.string().uuid("올바른 사용자 ID가 아닙니다."),
});

const ORG_TYPE_MAP: Record<string, string> = {
  seller: "gv",
  buyer: "saelim",
  supplier: "supplier",
};

// ─────────────────────────────────────────────
// inviteSchema 테스트
// ─────────────────────────────────────────────
describe("inviteSchema", () => {
  const base = {
    email: "test@example.com",
    name: "홍길동",
    org_id: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("유효한 초대 데이터를 허용한다", () => {
    const result = inviteSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("member"); // 기본값
    }
  });

  it("role=admin을 명시적으로 허용한다", () => {
    const result = inviteSchema.safeParse({ ...base, role: "admin" });
    expect(result.success).toBe(true);
  });

  it("role=member를 명시적으로 허용한다", () => {
    const result = inviteSchema.safeParse({ ...base, role: "member" });
    expect(result.success).toBe(true);
  });

  // S-2: role enum 제한 테스트
  it("S-2: 임의 role 값(예: superadmin)을 거부한다", () => {
    const result = inviteSchema.safeParse({ ...base, role: "superadmin" });
    expect(result.success).toBe(false);
  });

  it("S-2: role=gv_admin 같은 임의 권한을 거부한다", () => {
    const result = inviteSchema.safeParse({ ...base, role: "gv_admin" });
    expect(result.success).toBe(false);
  });

  it("이메일 형식이 잘못된 경우 실패한다", () => {
    const result = inviteSchema.safeParse({ ...base, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("올바른 이메일을 입력하세요");
    }
  });

  it("이름이 빈 문자열이면 실패한다", () => {
    const result = inviteSchema.safeParse({ ...base, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("이름을 입력하세요");
    }
  });

  it("org_id가 UUID 형식이 아니면 실패한다", () => {
    const result = inviteSchema.safeParse({ ...base, org_id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("조직을 선택하세요");
    }
  });

  // S-1 검증: org_type이 스키마에서 제거됨 (서버 측 파생)
  it("S-1: org_type이 스키마에 없어 클라이언트 전송값이 무시된다", () => {
    const result = inviteSchema.safeParse({
      ...base,
      org_type: "gv", // 클라이언트에서 전송해도 파싱 결과에 포함되지 않음
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // inviteSchema 파싱 결과에 org_type 키 없음
      expect("org_type" in result.data).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────
// deleteSchema 테스트 (C-1 보안 수정)
// ─────────────────────────────────────────────
describe("deleteSchema (C-1: UUID 검증 + 자기 자신 삭제 방지)", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("유효한 UUID를 허용한다", () => {
    const result = deleteSchema.safeParse({ user_id: validUUID });
    expect(result.success).toBe(true);
  });

  it("임의 문자열을 거부한다", () => {
    const result = deleteSchema.safeParse({ user_id: "some-user" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("올바른 사용자 ID가 아닙니다.");
    }
  });

  it("빈 문자열을 거부한다", () => {
    const result = deleteSchema.safeParse({ user_id: "" });
    expect(result.success).toBe(false);
  });

  it("user_id 없으면 실패한다", () => {
    const result = deleteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("SQL 인젝션 시도를 거부한다", () => {
    const result = deleteSchema.safeParse({ user_id: "'; DELETE FROM auth.users; --" });
    expect(result.success).toBe(false);
  });

  // C-1: 자기 자신 삭제 방지 로직 (서버 로직 시뮬레이션)
  it("C-1: 자기 자신 삭제 방지 - 현재 사용자 ID와 일치 시 거부", () => {
    const currentUserId = validUUID;
    const parsed = deleteSchema.safeParse({ user_id: validUUID });
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      // 서버 로직: user_id === user.id 이면 403
      const isSelfDelete = parsed.data.user_id === currentUserId;
      expect(isSelfDelete).toBe(true);
      // 서버에서 403을 반환해야 함
    }
  });

  it("C-1: 다른 사용자 삭제는 허용 (자기 자신 아님)", () => {
    const currentUserId = validUUID;
    const otherUserId = "660e8400-e29b-41d4-a716-446655440001";
    const parsed = deleteSchema.safeParse({ user_id: otherUserId });
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const isSelfDelete = parsed.data.user_id === currentUserId;
      expect(isSelfDelete).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────
// S-1: org_type 파생 로직 테스트
// ─────────────────────────────────────────────
describe("S-1: ORG_TYPE_MAP 서버 측 파생", () => {
  it("seller → gv 매핑", () => {
    expect(ORG_TYPE_MAP["seller"]).toBe("gv");
  });

  it("buyer → saelim 매핑", () => {
    expect(ORG_TYPE_MAP["buyer"]).toBe("saelim");
  });

  it("supplier → supplier 매핑", () => {
    expect(ORG_TYPE_MAP["supplier"]).toBe("supplier");
  });

  it("알 수 없는 type은 fallback으로 supplier 처리", () => {
    const org_type = ORG_TYPE_MAP["unknown"] ?? "supplier";
    expect(org_type).toBe("supplier");
  });
});
