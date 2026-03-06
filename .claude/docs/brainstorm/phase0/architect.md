# Phase 0 Architect Notes: 구현 로드맵

**Date:** 2026-03-06
**Role:** Architect
**Scope:** Phase 0 전체 구현 로드맵, 의존성, MCP 전략

---

## 1. Phase 0 전체 구현 로드맵

### Phase 0 정의
Phase 1(Foundation: Auth + Settings + DB) 구현 전에 필요한 **모든 인프라 준비** 단계.
코드 작성의 기반이 되는 환경 설정, DB 스키마, Auth 인프라, 기본 레이아웃을 구축한다.

### Sub-phases

#### Phase 0-A: Supabase 인프라
**목적:** DB + Auth + Storage 백엔드 인프라 완성
**작업:**
1. Supabase 프로젝트 생성 (MCP)
2. DB 마이그레이션 실행 (전체 테이블, 인덱스, RLS, RPC)
3. Storage 버킷 생성
4. Seed 데이터 투입
5. Auth 설정 (DISABLE_SIGNUP)
6. TypeScript 타입 자동생성

#### Phase 0-B: 프로젝트 의존성 & 설정
**목적:** 개발에 필요한 패키지 및 도구 설치
**작업:**
1. npm 패키지 설치 (@supabase/supabase-js, @supabase/ssr, zod)
2. Shadcn/ui 컴포넌트 설치 (sidebar, button, card, input, form 등)
3. 환경변수 설정 (.dev.vars, wrangler secrets)
4. TypeScript 경로 확인
5. 한국어 폰트 설정 (root.tsx)

#### Phase 0-C: Auth 시스템
**목적:** 인증/인가 인프라 구축
**작업:**
1. Supabase 서버 클라이언트 (app/lib/supabase.server.ts)
2. Auth 헬퍼 (app/lib/auth.server.ts)
3. 로그인 페이지 (app/routes/_auth.login.tsx)
4. Auth loader (app/loaders/auth.server.ts)
5. 로그아웃 action
6. 세션 cookie 관리

#### Phase 0-D: 기본 레이아웃 & 라우팅
**목적:** 앱 셸(shell) 구축
**작업:**
1. GV 레이아웃 (app/routes/_layout.tsx) - Shadcn Sidebar
2. Saelim 레이아웃 (app/routes/_saelim.tsx)
3. App Sidebar (app/components/layout/app-sidebar.tsx)
4. Page Container (app/components/layout/page-container.tsx)
5. Header (app/components/layout/header.tsx)
6. routes.ts 구성 (전체 라우트 구조)
7. root.tsx 개선 (lang="ko", 폰트)

#### Phase 0-E: 공통 유틸리티 & 타입
**목적:** 모든 모듈에서 사용할 공통 코드
**작업:**
1. TypeScript 타입 (app/types/database.ts, common.ts)
2. 포맷 유틸리티 (app/lib/format.ts)
3. 상수 (app/lib/constants.ts)
4. 공통 아이콘 (app/components/ui/icons.tsx)

---

## 2. Sub-phase 의존성 다이어그램

```
Phase 0-A (Supabase 인프라)          Phase 0-B (의존성 & 설정)
    │                                      │
    │  ┌───────────────────────────────────┘
    │  │
    ▼  ▼
Phase 0-C (Auth 시스템)              Phase 0-E (유틸리티)
    │                                      │
    │  ┌───────────────────────────────────┘
    │  │
    ▼  ▼
Phase 0-D (레이아웃 & 라우팅)
    │
    ▼
✅ Phase 0 완료 → Phase 1 시작
```

### 병렬 진행 가능
- **Phase 0-A + Phase 0-B:** 동시 진행 가능 (Supabase 설정 ↔ npm 패키지 설치)
- **Phase 0-C + Phase 0-E:** 부분 병렬 (format.ts, constants.ts는 Auth 불필요)
- **Phase 0-D:** Phase 0-C 완료 필요 (레이아웃에 auth user 정보 사용)

---

## 3. 파일 생성 순서 & 의존성

### Step 1: 설정 파일 (의존성 없음)
```
.dev.vars                          # 환경변수
app/lib/constants.ts               # 상수값 (포트, 통화, 상태)
app/lib/format.ts                  # 포맷 유틸리티
```

### Step 2: Supabase 타입 (Phase 0-A 완료 후)
```
app/types/database.ts              # Supabase 자동생성 타입 (← DB 마이그레이션 후)
app/types/common.ts                # 공통 타입 (← database.ts)
```

### Step 3: 서버 유틸리티 (Step 1-2 완료 후)
```
app/lib/supabase.server.ts         # ← .dev.vars, database.ts
app/lib/auth.server.ts             # ← supabase.server.ts
app/loaders/auth.server.ts         # ← auth.server.ts
```

### Step 4: 레이아웃 컴포넌트 (Shadcn 설치 후)
```
app/components/ui/icons.tsx        # ← lucide-react
app/components/layout/page-container.tsx   # ← shadcn/ui
app/components/layout/header.tsx   # ← shadcn/ui, auth.server.ts
app/components/layout/app-sidebar.tsx      # ← shadcn/ui sidebar, icons
```

### Step 5: 라우트 (Step 3-4 완료 후)
```
app/root.tsx                       # 수정 (lang, 폰트)
app/routes/_auth.login.tsx         # ← auth.server.ts, shadcn/ui
app/routes/_layout.tsx             # ← app-sidebar, header, auth
app/routes/_saelim.tsx             # ← header, auth
app/routes.ts                      # 수정 (라우트 구조)
workers/app.ts                     # 수정 (Env 타입)
```

---

## 4. Supabase MCP 활용 전략

### 실행 순서
```
1. mcp__supabase__list_organizations
   → 기존 Supabase organization 확인

2. mcp__supabase__list_projects
   → 기존 프로젝트 확인 (이미 있으면 재사용)

3. mcp__supabase__create_project (필요 시)
   → name: "saelim"
   → region: "ap-northeast-1" (Tokyo, 한국 가까움)
   → db_pass: 강력한 비밀번호 설정

4. mcp__supabase__get_project
   → project_id 확인

5. mcp__supabase__get_project_url
   → Supabase URL 확인

6. mcp__supabase__get_publishable_keys
   → anon key 확인

7. mcp__supabase__apply_migration (순서대로 실행)
   → 001 ~ 010 마이그레이션

8. mcp__supabase__execute_sql
   → Seed 데이터, 추가 설정

9. mcp__supabase__generate_typescript_types
   → app/types/database.ts 생성
```

### 주의사항
- `apply_migration`은 순서가 중요 (FK 의존성)
- 마이그레이션 실패 시 rollback 불가 → SQL을 먼저 검증
- `execute_sql`은 RLS 우회 (service_role) → 테스트용에만 사용

---

## 5. DB 마이그레이션 전략

### 접근법: 기능별 중형 마이그레이션 (권장)
단일 대형 마이그레이션은 디버깅이 어렵고, 너무 작은 마이그레이션은 관리 부담.
**기능 단위**로 분리하되 하나의 마이그레이션에 관련 테이블들을 묶는다.

### 마이그레이션 순서
```
001_extensions_and_helpers       # 확장, 트리거 함수, 헬퍼
002_core_tables                  # organizations, products, user_profiles, doc_sequences
003_document_tables              # PO, PI, shipping, stuffing, customs, deliveries, orders
004_content_system               # contents, attachments, comments
005_delivery_changes             # delivery_change_requests
006_rls_policies                 # 모든 테이블 RLS 정책
007_rpc_functions                # generate_doc_number, create_pi_from_po 등
008_indexes                      # 성능 인덱스
009_storage_buckets              # Storage 버킷 + 정책
010_seed_data                    # 초기 조직 데이터
```

### 네이밍 규칙
- `NNN_descriptive_name` (숫자 3자리 + 설명)
- 마이그레이션 이름은 Supabase MCP `apply_migration`의 name 파라미터로 전달

---

## 6. Phase 0 완료 기준 (Definition of Done)

### 인프라
- [ ] Supabase 프로젝트 생성 완료
- [ ] 모든 테이블 마이그레이션 실행 (mcp__supabase__list_tables로 확인)
- [ ] RLS 정책 적용 (모든 테이블 RLS 활성화)
- [ ] RPC 함수 생성 (generate_doc_number 등)
- [ ] Storage 버킷 3개 생성 (signatures, content-images, attachments)
- [ ] Seed 데이터 투입 (CHP, GV, Saelim 조직)
- [ ] TypeScript 타입 자동생성 완료

### Auth
- [ ] 환경변수 설정 (.dev.vars에 SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)
- [ ] supabase.server.ts - 서버 클라이언트 동작 확인
- [ ] auth.server.ts - getAuthUser, requireAuth 동작 확인
- [ ] 로그인 페이지 렌더링 + 로그인/로그아웃 동작
- [ ] 테스트 사용자 2명 생성 (GV admin, Saelim member)

### UI
- [ ] root.tsx: lang="ko", 한국어 폰트 적용
- [ ] _layout.tsx: Sidebar 레이아웃 렌더링
- [ ] app-sidebar.tsx: 네비게이션 메뉴 표시
- [ ] _saelim.tsx: 제한 레이아웃 렌더링
- [ ] _auth.login.tsx: 로그인 폼 동작
- [ ] 모바일 반응형 확인 (sidebar → sheet)

### 개발 환경
- [ ] `npm run dev` 정상 실행
- [ ] `npm run typecheck` 에러 없음
- [ ] 로그인 → Sidebar 레이아웃 → 빈 콘텐츠 영역 표시 흐름 동작

---

## 7. 구현 시 고려사항/위험요소

### 7.1 Cloudflare Workers + Supabase SSR
- **Cookie 핸들링:** Workers에서는 `document.cookie` 없음. `Request`/`Response` headers로만 cookie 조작
- **@supabase/ssr:** `createServerClient`에 cookie adapter 필요
  ```typescript
  // Workers에서 cookie 읽기: request.headers.get('Cookie')
  // Workers에서 cookie 쓰기: response.headers.append('Set-Cookie', ...)
  ```
- **번들 크기:** Workers 제한 (10MB compressed). @supabase/supabase-js는 ~50KB gzipped → 문제 없음

### 7.2 개발 환경 vs 프로덕션
| 항목 | 개발 (localhost:5173) | 프로덕션 (workers.dev) |
|------|----------------------|----------------------|
| 환경변수 | .dev.vars | wrangler secret |
| Cookie secure | false (HTTP) | true (HTTPS) |
| CORS | 불필요 (same origin) | 불필요 (same origin) |
| Supabase URL | 동일 | 동일 |

### 7.3 알려진 위험
1. **React Router 7 + Cloudflare Workers 호환성:** v8 Vite environment API 사용 → 최신 문서 확인 필요
2. **@supabase/ssr cookie adapter:** Cloudflare Workers 전용 예제가 제한적 → 직접 구현 필요할 수 있음
3. **Shadcn/ui Sidebar + React Router 7:** NavLink 통합 필요 → 커스터마이징
4. **초기 사용자 생성:** DISABLE_SIGNUP 상태에서 admin user 생성 → service_role_key 또는 Dashboard 사용
