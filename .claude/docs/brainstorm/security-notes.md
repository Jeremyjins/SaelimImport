# Security Review Notes: Saelim Import Management System

**Date:** 2026-03-06

---

## 1. Authentication Strategy

### Supabase Auth (Email, Invite-Only)

**Recommendation: DISABLE_SIGNUP=true**
- 5-10명 소규모 사용자 → 공개 회원가입 불필요
- Admin이 Supabase Dashboard에서 사용자 생성
- 또는 Settings > Users에서 초대 기능 구현

**Risks & Mitigations:**
| Risk | Mitigation |
|------|-----------|
| 비인가 가입 시도 | DISABLE_SIGNUP=true |
| Brute force 로그인 | Supabase rate limiting (기본 활성) |
| 약한 비밀번호 | 최소 8자 + 복잡성 요구 |
| 세션 탈취 | HTTPS only, httpOnly cookie, SameSite=Lax |

### Session Management on Cloudflare Workers
- Supabase JWT token을 cookie에 저장
- Server loader에서 매 요청마다 JWT 검증
- Refresh token rotation 활용
- Session 만료: 1시간 (access), 7일 (refresh)

### User Metadata for RLS
```json
// auth.users.raw_user_meta_data
{
  "org_id": "uuid-of-organization",
  "org_type": "gv" | "saelim"
}
```
- 사용자 생성 시 metadata 설정
- RLS에서 `auth.jwt() -> 'user_metadata'` 참조
- **주의:** user_metadata는 사용자가 변경 가능 → `app_metadata` 사용 권장

**수정 권장:**
```json
// auth.users.raw_app_meta_data (사용자 변경 불가)
{
  "org_id": "uuid-of-organization",
  "org_type": "gv" | "saelim"
}
```

---

## 2. Authorization & Role-Based Access

### Defense in Depth (3 Layers)

#### Layer 1: Database (RLS)
- 가장 강력한 보안 레이어
- Saelim 사용자는 DB 레벨에서 PO, PI, Customs 데이터 접근 불가
- 모든 테이블에 RLS 활성화 필수

#### Layer 2: Application (Server Loaders)
```typescript
// 모든 GV-only loader에서
export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await getAuthUser(request, context);
  if (user.org_type !== 'gv') {
    throw redirect('/saelim/delivery');
  }
  // ... data fetch
}
```

#### Layer 3: UI (Client-side)
- Sidebar 메뉴: org_type에 따라 다른 메뉴 표시
- 이것만으로는 보안이 아님 (URL 직접 접근 가능)
- UX 목적으로만 사용

---

## 3. Critical RLS Rules

### Saelim 데이터 격리

**절대 접근 불가:**
- `purchase_orders` - 모든 PO 데이터
- `proforma_invoices.details` - PI의 가격 정보 (amount, details 내 unit_price)
- `customs` - 모든 통관 비용 데이터
- `orders` - 오더 집계 데이터 (금액 포함)
- `contents` (type != delivery 관련)

**접근 가능:**
- `deliveries` - SELECT only
- `delivery_change_requests` - SELECT (own) + INSERT (own)
- `shipping_documents` - SELECT only (배송 관련 정보: vessel, eta 등)
  - **주의:** amount, details 컬럼은 제외해야 할 수 있음 → Column-level security 또는 View 사용

### Column-Level Security 대안
Supabase RLS는 row-level이므로 column 제한이 어려움.
**해결 방안:**
1. Saelim용 View 생성 (sensitive columns 제외)
2. Application level에서 데이터 필터링 (server loader)
3. 별도 delivery_view 테이블 (비정규화)

**권장:** Application level 필터링 + RLS 조합

---

## 4. Data Protection

### Sensitive Data Classification
| Level | Data | Protection |
|-------|------|-----------|
| High | PO/PI 가격, 통관 비용 | RLS + Loader guard |
| Medium | 조직 정보, 제품 정보 | RLS (GV only write) |
| Low | 배송일정, vessel 정보 | RLS (Saelim read OK) |

### File Upload Security
```
Validation:
- File type: whitelist (image/*, .pdf, .csv, .xlsx, .doc, .docx)
- File size: max 20MB (attachments), 5MB (images), 2MB (signatures)
- File name: sanitize (remove special chars, limit length)
- Content-Type: verify matches extension
```

### Signature Image
- Private bucket (not publicly accessible)
- Only GV users can upload/access
- Used only in server-side PDF generation or with signed URL

---

## 5. API Security

### Supabase Client Configuration
```
Server-side (loaders/actions):
- Use SUPABASE_ANON_KEY with user's JWT for RLS-protected queries
- Use SUPABASE_SERVICE_ROLE_KEY only for admin operations (user creation)
- NEVER expose SERVICE_ROLE_KEY to client

Client-side:
- No direct Supabase client access for data operations
- All data flows through React Router loaders/actions
- Exception: file upload directly to Supabase Storage (with user JWT)
```

### No Direct Client Access Pattern
```
Client → React Router Action → Supabase (with user JWT)
                              ↓
                         RLS enforced
```

---

## 6. CSRF & Input Validation

### CSRF
- React Router `<Form>` provides built-in CSRF protection
- All mutations go through `action` functions (POST requests)
- SameSite cookie policy prevents cross-origin attacks

### Input Validation
```
Server-side validation in actions:
- Document numbers: regex validation (GVXX{YYMM}-{NNN})
- Dates: valid date format, logical constraints (validity > date)
- Amounts: positive numbers, reasonable range
- Text fields: max length, sanitize HTML
- JSONB: schema validation (Zod recommended)

Client-side:
- HTML5 validation for UX
- Zod schemas shared with server
```

### SQL Injection Prevention
- Supabase client uses parameterized queries automatically
- Never construct raw SQL from user input
- RPC functions use parameterized inputs

---

## 7. Environment & Secrets Management

### Cloudflare Workers
```
# wrangler.toml secrets (never in code)
[vars]
SUPABASE_URL = "https://xxx.supabase.co"

# Set via wrangler secret
# wrangler secret put SUPABASE_ANON_KEY
# wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### Client Bundle
- No secrets in client bundle
- SUPABASE_URL may be in client (non-secret)
- SUPABASE_ANON_KEY may be in client (designed to be public with RLS)
- SERVICE_ROLE_KEY: NEVER in client

---

## 8. Audit Considerations

### Recommended for Phase 10
- `audit_log` table: who, what, when, before/after values
- Critical operations: document status changes, customs fee received, delivery changes
- Implementation: Postgres trigger or application-level logging

### Change Tracking
- `updated_at` timestamp on all tables (auto-update via trigger)
- `created_by` on all document tables
- Delivery change requests serve as audit for delivery changes
- Consider `updated_by` field for critical tables

### Checklist
- [ ] All tables have RLS enabled
- [ ] DISABLE_SIGNUP=true configured
- [ ] SERVICE_ROLE_KEY only in server-side code
- [ ] File upload validation implemented
- [ ] Loader guards for org-type checking
- [ ] Input validation with Zod schemas
- [ ] Column-level data filtering for Saelim users
