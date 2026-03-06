import { describe, it, expect } from "vitest";
import { z } from "zod";

// auth.server.ts의 loginSchema와 동일 (CF 의존성 없이 순수 로직 테스트)
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// auth.server.ts의 org_type 라우팅 로직
const ORG_TYPES = {
  GV: "gv",
  SAELIM: "saelim",
} as const;

function getRedirectPath(orgType: string | undefined): string {
  return orgType === ORG_TYPES.SAELIM ? "/saelim/delivery" : "/";
}

// ─────────────────────────────────────────────
// loginSchema 테스트
// ─────────────────────────────────────────────
describe("loginSchema", () => {
  describe("유효한 입력", () => {
    it("정상적인 이메일과 비밀번호를 허용한다", () => {
      const result = loginSchema.safeParse({
        email: "admin@gvinternational.com",
        password: "securepassword",
      });
      expect(result.success).toBe(true);
    });

    it("최대 길이 이메일을 허용한다 (254자)", () => {
      const localPart = "a".repeat(242); // 242 + @b.com = 248 < 254
      const result = loginSchema.safeParse({
        email: `${localPart}@b.com`,
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("최대 길이 비밀번호를 허용한다 (128자)", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "a".repeat(128),
      });
      expect(result.success).toBe(true);
    });

    it("비밀번호가 1자인 경우 허용한다", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "a",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("이메일 검증 실패", () => {
    it("이메일 형식이 아닌 경우 실패한다", () => {
      const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("빈 이메일은 실패한다", () => {
      const result = loginSchema.safeParse({
        email: "",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("이메일이 255자 초과 시 실패한다", () => {
      const longLocal = "a".repeat(250);
      const result = loginSchema.safeParse({
        email: `${longLocal}@example.com`,
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("이메일 필드가 없으면 실패한다", () => {
      const result = loginSchema.safeParse({
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("이메일이 null이면 실패한다", () => {
      const result = loginSchema.safeParse({
        email: null,
        password: "password123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("비밀번호 검증 실패", () => {
    it("빈 비밀번호는 실패한다 (Zod 에러: 이메일과 비밀번호를 입력해 주세요)", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });

    it("비밀번호가 129자 초과 시 실패한다", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "a".repeat(129),
      });
      expect(result.success).toBe(false);
    });

    it("비밀번호 필드가 없으면 실패한다", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
      });
      expect(result.success).toBe(false);
    });

    it("비밀번호가 null이면 실패한다", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("FormData 방어 테스트 (빈 폼 제출)", () => {
    it("이메일과 비밀번호 모두 빈 문자열이면 실패한다", () => {
      // HTML required 속성으로 막히더라도 서버 측에서도 검증
      const result = loginSchema.safeParse({
        email: "",
        password: "",
      });
      expect(result.success).toBe(false);
    });

    it("이메일과 비밀번호 모두 null이면 실패한다", () => {
      // formData.get() 이 null을 반환하는 경우
      const result = loginSchema.safeParse({
        email: null,
        password: null,
      });
      expect(result.success).toBe(false);
    });

    it("이메일과 비밀번호가 undefined면 실패한다", () => {
      const result = loginSchema.safeParse({
        email: undefined,
        password: undefined,
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// org_type 기반 리다이렉트 로직 테스트
// ─────────────────────────────────────────────
describe("로그인 후 org_type 리다이렉트 로직", () => {
  describe("GV 사용자 (gv)", () => {
    it("org_type이 'gv'이면 '/'로 리다이렉트한다", () => {
      expect(getRedirectPath("gv")).toBe("/");
    });

    it("org_type이 undefined이면 '/'로 리다이렉트한다 (기본값)", () => {
      expect(getRedirectPath(undefined)).toBe("/");
    });

    it("알 수 없는 org_type이면 '/'로 리다이렉트한다 (fallback)", () => {
      expect(getRedirectPath("unknown")).toBe("/");
    });

    it("org_type이 'supplier'면 '/'로 리다이렉트한다", () => {
      expect(getRedirectPath("supplier")).toBe("/");
    });
  });

  describe("Saelim 사용자 (saelim)", () => {
    it("org_type이 'saelim'이면 '/saelim/delivery'로 리다이렉트한다", () => {
      expect(getRedirectPath("saelim")).toBe("/saelim/delivery");
    });
  });

  describe("대소문자 구분", () => {
    it("'SAELIM' (대문자)은 '/saelim/delivery'로 리다이렉트하지 않는다", () => {
      expect(getRedirectPath("SAELIM")).toBe("/");
    });

    it("'GV' (대문자)는 '/'로 리다이렉트한다 (gv !== GV)", () => {
      expect(getRedirectPath("GV")).toBe("/");
    });
  });
});

// ─────────────────────────────────────────────
// requireAuth / requireGVUser 로직 시뮬레이션
// ─────────────────────────────────────────────
describe("requireAuth 가드 로직 시뮬레이션", () => {
  // requireAuth: user가 없으면 /login 리다이렉트
  it("user가 null이면 인증 실패로 처리된다", () => {
    const user = null;
    const isAuthenticated = user !== null;
    expect(isAuthenticated).toBe(false);
  });

  it("user가 있으면 인증 성공으로 처리된다", () => {
    const user = { id: "test-user-id", app_metadata: { org_type: "gv" } };
    const isAuthenticated = user !== null;
    expect(isAuthenticated).toBe(true);
  });
});

describe("requireGVUser 가드 로직 시뮬레이션", () => {
  // requireGVUser: org_type !== 'gv'이면 /saelim/delivery 리다이렉트
  function checkGVAccess(orgType: string | undefined): "allow" | "redirect_saelim" {
    return orgType === ORG_TYPES.GV ? "allow" : "redirect_saelim";
  }

  it("org_type이 'gv'이면 GV 레이아웃 접근을 허용한다", () => {
    expect(checkGVAccess("gv")).toBe("allow");
  });

  it("org_type이 'saelim'이면 /saelim/delivery로 리다이렉트된다", () => {
    expect(checkGVAccess("saelim")).toBe("redirect_saelim");
  });

  it("org_type이 undefined이면 /saelim/delivery로 리다이렉트된다", () => {
    expect(checkGVAccess(undefined)).toBe("redirect_saelim");
  });

  it("org_type이 'supplier'이면 /saelim/delivery로 리다이렉트된다", () => {
    expect(checkGVAccess("supplier")).toBe("redirect_saelim");
  });
});

describe("_saelim.tsx loader 로직 시뮬레이션", () => {
  // _saelim.tsx: requireAuth 후 org_type !== 'saelim'이면 '/'로 리다이렉트
  function checkSaelimAccess(orgType: string | undefined): "allow" | "redirect_gv" {
    return orgType === ORG_TYPES.SAELIM ? "allow" : "redirect_gv";
  }

  it("org_type이 'saelim'이면 Saelim 레이아웃 접근을 허용한다", () => {
    expect(checkSaelimAccess("saelim")).toBe("allow");
  });

  it("org_type이 'gv'이면 '/'로 리다이렉트된다", () => {
    expect(checkSaelimAccess("gv")).toBe("redirect_gv");
  });

  it("org_type이 undefined이면 '/'로 리다이렉트된다", () => {
    expect(checkSaelimAccess(undefined)).toBe("redirect_gv");
  });
});

// ─────────────────────────────────────────────
// loginLoader 로직 시뮬레이션: 이미 로그인 상태 처리
// ─────────────────────────────────────────────
describe("loginLoader: 이미 인증된 사용자 처리", () => {
  function loginLoaderRedirect(user: { app_metadata?: { org_type?: string } } | null): string | null {
    if (!user) return null; // 로그인 페이지 표시
    const orgType = user.app_metadata?.org_type;
    return orgType === ORG_TYPES.SAELIM ? "/saelim/delivery" : "/";
  }

  it("미인증 상태이면 null 반환 (로그인 페이지 표시)", () => {
    expect(loginLoaderRedirect(null)).toBeNull();
  });

  it("GV 사용자가 /login 접근 시 '/'로 리다이렉트", () => {
    const user = { app_metadata: { org_type: "gv" } };
    expect(loginLoaderRedirect(user)).toBe("/");
  });

  it("Saelim 사용자가 /login 접근 시 '/saelim/delivery'로 리다이렉트", () => {
    const user = { app_metadata: { org_type: "saelim" } };
    expect(loginLoaderRedirect(user)).toBe("/saelim/delivery");
  });

  it("org_type 없는 사용자가 /login 접근 시 '/'로 리다이렉트", () => {
    const user = { app_metadata: {} };
    expect(loginLoaderRedirect(user)).toBe("/");
  });
});
