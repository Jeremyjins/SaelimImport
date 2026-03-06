# Phase 0 Security Review Notes

**Date:** 2026-03-06
**Role:** Security Reviewer
**Scope:** Phase 0 보안 체크리스트, Auth 보안, 환경변수, RLS 기초

---

## 1. Phase 0 보안 체크리스트

### 필수 (P0)
- [ ] DISABLE_SIGNUP=true 설정 (Supabase Auth)
- [ ] app_metadata 사용 (user_metadata 대신) - org_id, org_type
- [ ] SERVICE_ROLE_KEY를 클라이언트에 절대 노출하지 않음
- [ ] 모든 테이블에 RLS 활성화 (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
- [ ] 모든 loader에서 인증 체크 (requireAuth)
- [ ] Cookie: httpOnly, secure (production), SameSite=Lax
- [ ] .dev.vars를 .gitignore에 추가

### 중요 (P1)
- [ ] GV-only route에서 org_type 체크 (requireGVUser)
- [ ] JWT custom claims에 org_type 포함 (RLS 성능)
- [ ] 비밀번호 최소 8자 + 복잡성 요구
- [ ] 환경변수가 빌드 결과물에 포함되지 않는지 확인

### 권장 (P2)
- [ ] Rate limiting 고려 (Cloudflare Workers 레벨)
- [ ] Error 메시지에 민감 정보 미포함 확인
- [ ] Content-Security-Policy 헤더 고려

---

## 2. Auth 구현 보안

### 2.1 app_metadata vs user_metadata

**위험:** `user_metadata`는 사용자가 Supabase Auth API를 통해 직접 수정 가능.
```javascript
// 사용자가 직접 실행 가능 - 위험!
supabase.auth.updateUser({
  data: { org_type: 'gv' }  // Saelim 사용자가 GV로 변경 가능
})
```

**해결:** `app_metadata`는 service_role_key로만 수정 가능 → 서버사이드에서만 설정.
```javascript
// 서버에서만 (service_role_key 필요)
supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: { org_id: 'uuid', org_type: 'gv' }
})
```

**RLS 함수에서의 참조:**
```sql
-- 안전한 방식 (app_metadata)
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type')::TEXT;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 2.2 Invite-Only 설정

Supabase Dashboard에서:
- Authentication > Providers > Email > "Enable Email Signup" 끄기
- 또는 Auth 설정에서 `DISABLE_SIGNUP=true`

사용자 생성은 오직:
1. Supabase Dashboard에서 수동 생성
2. service_role_key를 사용한 Admin API (`auth.admin.createUser`)

### 2.3 JWT Session Cookie 설정

```typescript
// Supabase @supabase/ssr의 cookie 옵션
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',  // HTTPS만
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7,  // 7일 (refresh token)
};
```

**주의:**
- `httpOnly: true` → JavaScript에서 접근 불가 (XSS 방지)
- `secure: true` → HTTPS에서만 전송 (production)
- `sameSite: 'lax'` → 같은 사이트 요청 + top-level navigation에서만 전송
- 개발 환경(localhost)에서는 `secure: false` 필요

### 2.4 Cloudflare Workers 환경 고려사항

- Workers에서는 `document.cookie` 없음 → Request/Response headers로만 cookie 처리
- `@supabase/ssr`의 `getAll`/`setAll` 콜백으로 구현
- Set-Cookie 헤더 여러 개 처리: `response.headers.append('Set-Cookie', ...)` 사용
- `getSetCookie()` 메서드로 모든 Set-Cookie 헤더 조회

### 2.5 Session 만료 전략

| Token | 만료 시간 | 갱신 방법 |
|-------|----------|----------|
| Access Token | 1시간 (기본) | Refresh Token으로 갱신 |
| Refresh Token | 7일 (기본) | 로그인 시 새로 발급 |

- Supabase SSR은 access token 만료 시 자동으로 refresh 시도
- `setAll` 콜백으로 갱신된 토큰이 response cookie에 설정됨
- Refresh token rotation 활성화 권장 (Supabase Dashboard에서 설정)

---

## 3. 환경변수 보안

### 변수 분류

| 변수 | 민감도 | 클라이언트 노출 | 저장 위치 |
|------|--------|----------------|----------|
| SUPABASE_URL | Low | OK (public) | wrangler.jsonc vars |
| SUPABASE_ANON_KEY | Low | OK (RLS 보호) | wrangler.jsonc vars 또는 secret |
| SUPABASE_SERVICE_ROLE_KEY | **Critical** | **절대 금지** | wrangler secret only |

### 설정 방법

**로컬 개발 (.dev.vars):**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**프로덕션 (wrangler secret):**
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### .gitignore 확인
```
# 반드시 포함
.dev.vars
.env
.env.local
```

### Workers 코드에서의 접근
```typescript
// loader/action에서만 (서버 코드)
context.cloudflare.env.SUPABASE_SERVICE_ROLE_KEY

// 클라이언트 코드에서는 접근 불가 (Workers 서버사이드)
// BUT: 빌드 시 인라인되지 않도록 주의
// context.cloudflare.env는 런타임에만 존재 → 안전
```

---

## 4. RLS 기초 보안

### 4.1 기본 RLS 정책 패턴

```sql
-- 1. 모든 테이블 RLS 활성화
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stuffing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE customs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;

-- 2. 헬퍼 함수 (app_metadata 기반)
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_type')::TEXT,
    ''
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. GV: 전체 접근
CREATE POLICY "gv_full_access" ON purchase_orders
  FOR ALL USING (get_user_org_type() = 'gv');

-- 4. Saelim: 배송만 읽기
CREATE POLICY "saelim_read_deliveries" ON deliveries
  FOR SELECT USING (get_user_org_type() = 'saelim');

-- 5. Saelim: 배송변경 요청 생성/읽기
CREATE POLICY "saelim_manage_change_requests" ON delivery_change_requests
  FOR ALL USING (
    get_user_org_type() = 'saelim'
    AND requested_by = auth.uid()
  );
```

### 4.2 RLS 테스트 방법

```sql
-- 테스트 1: GV 사용자로 PO 접근 (성공해야 함)
-- Supabase client를 GV JWT로 호출

-- 테스트 2: Saelim 사용자로 PO 접근 (실패해야 함)
-- Supabase client를 Saelim JWT로 호출

-- 테스트 3: RLS 없이 접근 (service_role)
-- execute_sql로 확인: 모든 데이터 반환
```

**MCP로 RLS 검증:**
```
mcp__supabase__execute_sql → 테이블 데이터 확인 (RLS 우회)
→ RLS가 활성화되어도 service_role은 우회함
→ 실제 테스트는 anon key + 특정 사용자 JWT로 해야 함
```

### 4.3 RLS 성능 고려

- `get_user_org_type()` 함수에 `STABLE` 마킹 → 같은 트랜잭션 내 캐싱
- 단순한 정책 유지 (JOIN 없는 직접 비교)
- `app_metadata`가 JWT에 포함되므로 추가 DB 조회 없음

---

## 5. 첫 Admin 사용자 생성 보안

### 방법 1: Supabase Dashboard (권장)
1. Supabase Dashboard > Authentication > Users > "Add User"
2. Email + Password 입력
3. 생성 후 SQL Editor에서 app_metadata 설정:
```sql
-- Dashboard SQL Editor에서 (service_role 권한)
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{org_type}', '"gv"'
)
WHERE email = 'admin@gvinternational.com';

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  raw_app_meta_data,
  '{org_id}', '"해당-org-uuid"'
)
WHERE email = 'admin@gvinternational.com';
```

### 방법 2: MCP execute_sql
```sql
-- mcp__supabase__execute_sql로 실행
-- Supabase Auth Admin API 대신 직접 SQL
SELECT auth.admin_create_user(
  'admin@gvinternational.com',
  'StrongP@ssw0rd!',
  '{"org_type": "gv", "org_id": "gv-org-uuid"}'::jsonb
);
```

### 비밀번호 정책
- 최소 8자
- 초기 비밀번호는 강력하게 설정 후 첫 로그인 시 변경 권장
- 5-10명 소규모이므로 복잡한 정책보다 안전한 비밀번호 직접 전달

---

## 6. CORS & Cookie 설정

### CORS
- **불필요:** React Router SSR → 모든 API 호출이 same-origin (서버사이드)
- Supabase 호출도 서버 loader/action에서 수행 → CORS 무관
- 클라이언트에서 직접 Supabase 호출 시에만 CORS 필요 (현재 아키텍처에서는 안 함)

### Cookie 보안

| 속성 | 개발환경 | 프로덕션 |
|------|---------|---------|
| HttpOnly | true | true |
| Secure | false | true |
| SameSite | Lax | Lax |
| Path | / | / |
| Domain | localhost | 자동 |

### Cloudflare Workers 특수 고려
- Workers는 자체적으로 HTTPS 제공 (*.workers.dev)
- Custom domain 사용 시에도 Cloudflare가 SSL 처리
- Cookie의 `Secure` 속성은 production에서 항상 true

---

## 7. 코드 패턴 보안

### 7.1 표준 인증 체크 패턴

```typescript
// app/lib/auth.server.ts

// 인증 필수 (미인증 시 로그인 redirect)
export async function requireAuth(request: Request, context: AppLoadContext) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    throw redirect('/login', { headers: responseHeaders });
  }

  return { user, supabase, responseHeaders };
}

// GV 사용자 전용
export function requireGVUser(user: User) {
  const orgType = user.app_metadata?.org_type;
  if (orgType !== 'gv') {
    throw redirect('/saelim/delivery');
  }
}

// 선택적 인증 (로그인 안 해도 되는 페이지)
export async function getOptionalUser(request: Request, context: AppLoadContext) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase, responseHeaders };
}
```

### 7.2 Saelim 데이터 필터링

```typescript
// Saelim 사용자에게 반환하는 배송 정보에서 민감 데이터 제거
function filterDeliveryForSaelim(delivery: DeliveryWithDetails) {
  return {
    id: delivery.id,
    delivery_date: delivery.delivery_date,
    vessel: delivery.vessel,
    voyage: delivery.voyage,
    eta: delivery.eta,
    product_name: delivery.product_name,
    // amount, unit_price, customs 정보 제외
  };
}
```

### 7.3 SQL Injection 방지
- Supabase client는 parameterized queries 사용 → SQL injection 불가
- **절대 금지:** 사용자 입력으로 raw SQL 구성
- RPC 함수도 parameterized input 사용

### 7.4 XSS 방지
- React는 기본적으로 JSX 출력을 escape
- **주의:** `dangerouslySetInnerHTML` 사용 금지 (Tiptap 렌더링 제외)
- Tiptap JSON → HTML 변환 시 sanitize 필요 (Phase 4)
- 사용자 입력 텍스트는 항상 React 컴포넌트로 렌더링

---

## 8. 위협 모델 (Threat Model)

### 8.1 비인가 접근 시도
| 위협 | 가능성 | 대응 |
|------|--------|------|
| URL 직접 접근 (/po, /customs) | 높음 | Loader redirect + RLS |
| API 직접 호출 (PostgREST) | 중간 | RLS 정책으로 차단 |
| 만료된 JWT 재사용 | 낮음 | Supabase 자동 검증 |

### 8.2 권한 상승 (Saelim → GV)
| 위협 | 가능성 | 대응 |
|------|--------|------|
| user_metadata 변조 | 높음 (만약 user_metadata 사용 시) | **app_metadata 사용으로 차단** |
| JWT 위조 | 매우 낮음 | Supabase JWT 서명 검증 |
| URL 조작 | 높음 | Loader guard + RLS |

### 8.3 Session 탈취
| 위협 | 가능성 | 대응 |
|------|--------|------|
| XSS → Cookie 탈취 | 낮음 | httpOnly cookie |
| 네트워크 스니핑 | 매우 낮음 | HTTPS (Cloudflare) |
| CSRF | 낮음 | SameSite=Lax + React Router Form |

### 8.4 환경변수 노출
| 위협 | 가능성 | 대응 |
|------|--------|------|
| SERVICE_ROLE_KEY 클라이언트 노출 | 중간 (실수 시) | context.cloudflare.env (런타임만) |
| .dev.vars Git 커밋 | 중간 (실수 시) | .gitignore 확인 |
| 빌드 로그에 키 출력 | 낮음 | 로그 출력 금지 |
