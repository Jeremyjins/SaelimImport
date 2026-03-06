# Phase 1 구현계획: Foundation - Settings CRUD

**Date:** 2026-03-06
**Status:** 완료
**전제조건:** [Phase 0-A 완료](PROJECT_INIT_IMPLEMENT_PHASE_0-A.md), [Phase 0-B 완료](PROJECT_INIT_IMPLEMENT_PHASE_0-B.md)

---

## 범위

Phase 0에서 인프라/Auth/레이아웃이 완료됨. Phase 1 남은 작업:
1. Settings - Organizations CRUD (거래처 관리)
2. Settings - Products CRUD (제품 관리)
3. Settings - Users 관리 (사용자 초대 및 관리)

---

## 에이전트 팀 구성

| 역할 | 담당 영역 | 파일 소유권 |
|------|----------|------------|
| **Architect** | 전체 설계, 타입 구조 | (리뷰) |
| **Frontend Dev** | 설정 페이지 UI (Table, Dialog, Form) | `app/routes/_layout.settings.*.tsx` |
| **Backend Dev** | Loader/Action, Supabase Admin Client | `app/loaders/settings.*.server.ts`, `app/lib/supabase-admin.server.ts` |
| **Security Reviewer** | GV-only 접근 제어, 데이터 검증 | (리뷰) |

> **제외 팀원**: Tester, Perf-analyzer, Code-reviewer, Researcher (현 단계 불필요)

---

## 추가 필요 shadcn/ui 컴포넌트

```bash
npx shadcn@latest add table badge select textarea alert-dialog
```

---

## Task 목록

### Task 1: shadcn/ui 추가 컴포넌트 설치 [완료]
**담당:** Frontend Dev
- [x] table, badge, select, textarea, alert-dialog 설치

---

### Task 2: Supabase Admin Client 생성 [완료]
**담당:** Backend Dev
**파일:** `app/lib/supabase-admin.server.ts`

Users 관리에서 Supabase Admin API (service_role_key) 필요:
- `admin.listUsers()` - 전체 사용자 조회
- `admin.inviteUserByEmail()` - 사용자 초대
- `admin.updateUserById()` - app_metadata 설정

---

### Task 3: Pencil MCP 디자인 초안 [완료]
**담당:** Frontend Dev (Pencil MCP)
**대상:**
- [x] Settings - Organizations 페이지 (테이블 + 다이얼로그)
- [x] Settings - Products 페이지 (테이블 + 다이얼로그)
- [x] Settings - Users 페이지 (테이블 + 초대 다이얼로그)

---

### Task 4: Organizations CRUD 구현 [완료]
**담당:** Backend Dev (loader/action) + Frontend Dev (UI)

**파일:**
- [x] `app/loaders/settings.organizations.server.ts`
- [x] `app/routes/_layout.settings.organizations.tsx`

**기능:**
- [x] 거래처 목록 조회 (soft delete 필터)
- [x] 거래처 생성 Dialog (type, name_en, name_ko, address_en, address_ko, phone, fax)
- [x] 거래처 수정 Dialog (동일 폼, id 포함)
- [x] 거래처 소프트 삭제 (AlertDialog 확인)
- [x] Zod 검증
- [x] GV-only 접근 (requireGVUser)

**Zod Schema:**
```typescript
const orgSchema = z.object({
  _action: z.enum(['create', 'update']),
  id: z.string().uuid().optional(),
  type: z.enum(['supplier', 'seller', 'buyer']),
  name_en: z.string().min(1, '영문명을 입력하세요'),
  name_ko: z.string().optional(),
  address_en: z.string().optional(),
  address_ko: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
});
```

---

### Task 5: Products CRUD 구현 [완료]
**담당:** Backend Dev (loader/action) + Frontend Dev (UI)

**파일:**
- [x] `app/loaders/settings.products.server.ts`
- [x] `app/routes/_layout.settings.products.tsx`

**기능:**
- [x] 제품 목록 조회 (soft delete 필터)
- [x] 제품 생성 Dialog (name, gsm, width_mm, hs_code)
- [x] 제품 수정 Dialog
- [x] 제품 소프트 삭제 (AlertDialog 확인)
- [x] Zod 검증
- [x] GV-only 접근

**Zod Schema:**
```typescript
const productSchema = z.object({
  _action: z.enum(['create', 'update']),
  id: z.string().uuid().optional(),
  name: z.string().min(1, '제품명을 입력하세요'),
  gsm: z.coerce.number().int().positive().optional(),
  width_mm: z.coerce.number().int().positive().optional(),
  hs_code: z.string().optional(),
});
```

---

### Task 6: Users Management 구현 [완료]
**담당:** Backend Dev (loader/action) + Frontend Dev (UI)

**파일:**
- [x] `app/loaders/settings.users.server.ts`
- [x] `app/routes/_layout.settings.users.tsx`

**기능:**
- [x] 사용자 목록 (auth.users + user_profiles JOIN)
- [x] 사용자 초대 Dialog (email, name, org_id, org_type)
- [x] app_metadata 설정 (org_type, org_id)
- [x] GV-only 접근
- [x] Supabase Admin API 사용

**Invite Flow:**
```
1. adminClient.auth.admin.inviteUserByEmail(email)
2. adminClient.auth.admin.updateUserById(userId, { app_metadata: { org_type, org_id } })
3. supabase.from('user_profiles').insert({ id: userId, name, org_id, role: 'member' })
```

---

### Task 7: 타입 체크 & 검증 [완료]
- [x] `npm run typecheck` 에러 없음
- [x] 각 페이지 렌더링 확인
- [x] CRUD 기능 동작 확인

---

## 파일 소유권 매핑

```
app/
  lib/
    supabase-admin.server.ts         # Backend Dev
  loaders/
    settings.organizations.server.ts # Backend Dev
    settings.products.server.ts      # Backend Dev
    settings.users.server.ts         # Backend Dev
  routes/
    _layout.settings.organizations.tsx # Frontend Dev
    _layout.settings.products.tsx      # Frontend Dev
    _layout.settings.users.tsx         # Frontend Dev
```

---

## 구현 결과

### 생성된 파일
| 파일 | 상태 | 내용 |
|------|------|------|
| `app/lib/supabase-admin.server.ts` | 신규 | Supabase Admin Client (service_role_key) |
| `app/loaders/settings.organizations.server.ts` | 신규 | Organizations CRUD loader/action |
| `app/loaders/settings.products.server.ts` | 신규 | Products CRUD loader/action |
| `app/loaders/settings.users.server.ts` | 신규 | Users 관리 loader/action |
| `app/routes/_layout.settings.organizations.tsx` | 수정 | Organizations 페이지 (Table + Dialog) |
| `app/routes/_layout.settings.products.tsx` | 수정 | Products 페이지 (Table + Dialog) |
| `app/routes/_layout.settings.users.tsx` | 수정 | Users 페이지 (Table + 초대 Dialog) |

---

## Phase 1 완료 기준 (DoD)

- [x] Organizations 목록/생성/수정/삭제 동작
- [x] Products 목록/생성/수정/삭제 동작
- [x] Users 목록/초대/app_metadata 설정 동작
- [x] GV 사용자만 접근 가능 (requireGVUser)
- [x] Zod 검증으로 잘못된 입력 차단
- [x] 소프트 삭제 (deleted_at 설정)
- [x] npm run typecheck 에러 없음

---

## 다음 단계: Phase 2

Phase 2: Purchase Order (PO)
1. PO 목록 (상태 필터: 전체/진행/완료)
2. PO 생성 (자동 번호 생성: GVPOYYMM-XXX)
3. PO 상세 페이지
4. PO 수정
5. PO 클론
6. PO 상태 토글 (진행/완료)
