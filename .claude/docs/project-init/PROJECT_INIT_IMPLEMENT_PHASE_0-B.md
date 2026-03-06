# Phase 0-B 구현계획: 프로젝트 의존성, Auth, 레이아웃, 유틸리티

**Date:** 2026-03-06
**Status:** 완료
**참조:** [Phase 0 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_0.md)
**전제조건:** [Phase 0-A 완료](PROJECT_INIT_IMPLEMENT_PHASE_0-A.md)

---

## 범위

Phase 0-B는 Phase 0-A(Supabase 인프라) 이후 남은 모든 Phase 0 작업을 포함한다:
- **0-B**: npm 패키지 & shadcn/ui 컴포넌트 설치
- **0-C**: Auth 시스템 (supabase.server.ts, auth.server.ts, login)
- **0-D**: 기본 레이아웃 & 라우팅 (GV sidebar, Saelim header)
- **0-E**: 공통 유틸리티 & 타입

---

## 에이전트 팀 구성

| 역할 | 담당 영역 | 파일 소유권 |
|------|----------|------------|
| **Architect** | 라우팅 구조, 전체 설계 검토 | `app/routes.ts` |
| **Frontend Dev** | 레이아웃, 로그인 UI, shadcn 설치 | `app/routes/`, `app/components/layout/`, `app/components/ui/icons.tsx` |
| **Backend Dev** | Supabase 클라이언트, Auth, 유틸리티 | `app/lib/*.server.ts`, `app/loaders/auth.server.ts`, `app/lib/constants.ts`, `app/lib/format.ts`, `app/types/common.ts` |
| **Security Reviewer** | Auth 패턴 검토, RLS 연계 확인 | (리뷰어, 파일 소유권 없음) |

> **제외 팀원**: Tester(테스트 인프라 미설정), Perf Analyzer(현 단계 불필요), Code Reviewer(인라인 검토로 충분), Researcher(브레인스토밍 완료)

---

## Task 목록

### Task 1: npm 패키지 설치 [완료]
**담당:** Backend Dev
**명령어:**
```bash
npm install @supabase/supabase-js @supabase/ssr zod
```
**완료 기준:**
- [x] package.json에 @supabase/supabase-js, @supabase/ssr, zod 추가
- [x] node_modules 설치 완료

**구현 노트:**
- `parseCookieHeader` 반환값의 `value?: string | undefined` 타입이 `@supabase/ssr`의 `GetAllCookies` 요구 타입 `{ name: string; value: string }[]`과 불일치 → `.map(({ name, value }) => ({ name, value: value ?? "" }))` 로 수정

---

### Task 2: shadcn/ui 컴포넌트 설치 [완료]
**담당:** Frontend Dev
**설치 목록:**
```bash
# 레이아웃 (최우선)
npx shadcn@latest add sidebar separator sheet collapsible tooltip

# 인증 (로그인 폼)
npx shadcn@latest add button card input label

# 인터랙션
npx shadcn@latest add dialog dropdown-menu avatar sonner
```
**완료 기준:**
- [x] sidebar, separator, sheet, collapsible, tooltip 설치
- [x] button, card, input, label 설치
- [x] dialog, dropdown-menu, avatar, sonner 설치

---

### Task 3: 디자인 초안 (Pencil MCP) [완료]
**담당:** Frontend Dev (Pencil MCP 활용)
**대상:**
- [x] 로그인 페이지 디자인 초안
- [x] GV 메인 레이아웃 (Sidebar) 디자인 초안
- [x] Saelim 레이아웃 (Simple Header) 디자인 초안

---

### Task 4: 공통 유틸리티 파일 생성 [완료]
**담당:** Backend Dev
**파일:**
- [x] `app/lib/constants.ts` - 도메인 상수 (통화, 항구, 결제조건 등)
- [x] `app/lib/format.ts` - 날짜/금액/무게 포맷터 (null/undefined 안전 처리)
- [x] `app/types/common.ts` - OrgType, DocStatus, Currency, AppUser, ActionResult

---

### Task 5: Supabase & Auth 서버 파일 생성 [완료]
**담당:** Backend Dev + Security Reviewer 검토
**파일:**
- [x] `app/lib/supabase.server.ts` - @supabase/ssr 서버 클라이언트 (getAll/setAll 패턴)
- [x] `app/lib/auth.server.ts` - requireAuth, requireGVUser, getOptionalUser
- [x] `app/loaders/auth.server.ts` - loginLoader, loginAction, logoutAction

**구현 노트:**
- 공유 로더 파일에서 Route 타입 대신 `AppLoadContext` + 인라인 인터페이스 사용
- `data()` 헬퍼로 loader 반환 (Response.json보다 타입 추론 안전)
- `_auth.logout.tsx` 별도 파일로 `/logout` POST 엔드포인트 분리

---

### Task 6: UI 컴포넌트 파일 생성 [완료]
**담당:** Frontend Dev
**파일:**
- [x] `app/components/ui/icons.tsx` - lucide-react 아이콘 모음
- [x] `app/components/layout/app-sidebar.tsx` - GV 사이드바 네비게이션
- [x] `app/components/layout/page-container.tsx` - 페이지 래퍼
- [x] `app/components/layout/header.tsx` - 인라인 헤더 (breadcrumb, user menu)

---

### Task 7: 라우트 파일 생성 [완료]
**담당:** Architect (routes.ts) + Frontend Dev (route 파일들)
**파일:**
- [x] `app/routes/_auth.login.tsx` - 로그인 페이지
- [x] `app/routes/_layout.tsx` - GV 메인 레이아웃
- [x] `app/routes/_layout.home.tsx` - GV 홈 (대시보드 플레이스홀더)
- [x] `app/routes/_saelim.tsx` - Saelim 레이아웃
- [x] `app/routes/_saelim.delivery.tsx` - Saelim 배송 (플레이스홀더)
- [x] `app/routes.ts` - 전체 라우트 구성 업데이트

---

### Task 8: 기존 파일 수정 [완료]
**담당:** Architect
**파일:**
- [x] `app/root.tsx` - Toaster 컴포넌트 추가 (sonner)
- [x] `app/routes/home.tsx` → 삭제 및 `_layout.home.tsx`로 대체

---

### Task 9: 타입 체크 & 검증 [완료]
**담당:** 전체 팀
- [x] `npm run typecheck` 에러 없음
- [x] `npm run dev` 정상 실행
- [x] 로그인 → Sidebar → 빈 콘텐츠 영역 흐름 동작 확인

---

## 파일 소유권 매핑

```
app/
  lib/
    supabase.server.ts     # Backend Dev
    auth.server.ts         # Backend Dev
    constants.ts           # Backend Dev
    format.ts              # Backend Dev
  types/
    common.ts              # Backend Dev
  loaders/
    auth.server.ts         # Backend Dev
  components/
    ui/
      icons.tsx            # Frontend Dev
    layout/
      app-sidebar.tsx      # Frontend Dev
      page-container.tsx   # Frontend Dev
      header.tsx           # Frontend Dev
  routes/
    _auth.login.tsx        # Frontend Dev
    _layout.tsx            # Frontend Dev
    _layout.home.tsx       # Frontend Dev
    _saelim.tsx            # Frontend Dev
    _saelim.delivery.tsx   # Frontend Dev
  routes.ts                # Architect
```

---

## 구현 결과

### 설치된 패키지
| 패키지 | 버전 | 용도 |
|--------|------|------|
| @supabase/supabase-js | latest | Supabase JS 클라이언트 |
| @supabase/ssr | latest | SSR 쿠키 기반 auth |
| zod | latest | 폼 검증 |

### 설치된 shadcn/ui 컴포넌트
sidebar, separator, sheet, collapsible, tooltip, button, card, input, label, dialog, dropdown-menu, avatar, sonner

### 생성/수정된 파일
| 파일 | 상태 | 내용 |
|------|------|------|
| `app/lib/supabase.server.ts` | 신규 | @supabase/ssr 서버 클라이언트 |
| `app/lib/auth.server.ts` | 신규 | Auth 헬퍼 함수 |
| `app/lib/constants.ts` | 신규 | 도메인 상수 |
| `app/lib/format.ts` | 신규 | 포맷 유틸리티 |
| `app/types/common.ts` | 신규 | 공통 타입 |
| `app/loaders/auth.server.ts` | 신규 | 로그인/로그아웃 액션 |
| `app/components/ui/icons.tsx` | 신규 | 아이콘 모음 |
| `app/components/layout/app-sidebar.tsx` | 신규 | GV 사이드바 |
| `app/components/layout/page-container.tsx` | 신규 | 페이지 컨테이너 |
| `app/components/layout/header.tsx` | 신규 | 헤더 컴포넌트 |
| `app/routes/_auth.login.tsx` | 신규 | 로그인 페이지 |
| `app/routes/_layout.tsx` | 신규 | GV 레이아웃 |
| `app/routes/_layout.home.tsx` | 신규 | GV 홈 |
| `app/routes/_saelim.tsx` | 신규 | Saelim 레이아웃 |
| `app/routes/_saelim.delivery.tsx` | 신규 | Saelim 배송 |
| `app/routes.ts` | 수정 | 전체 라우트 구성 |
| `app/root.tsx` | 수정 | Toaster 추가 |

---

## Phase 0-B 완료 기준 (DoD)

- [x] @supabase/supabase-js, @supabase/ssr, zod 설치
- [x] shadcn/ui 컴포넌트 설치 (sidebar, separator, sheet, collapsible, tooltip, button, card, input, label, dialog, dropdown-menu, avatar, sonner)
- [x] Pencil MCP 디자인 초안 생성 (로그인, GV 레이아웃, Saelim 레이아웃)
- [x] app/lib/supabase.server.ts 동작
- [x] app/lib/auth.server.ts 동작
- [x] 로그인/로그아웃 액션 동작
- [x] GV 사이드바 레이아웃 렌더링
- [x] Saelim 헤더 레이아웃 렌더링
- [x] 로그인 페이지 렌더링
- [x] routes.ts 전체 라우트 구성
- [x] npm run typecheck 에러 없음
- [x] npm run dev 정상 실행 (/ → 302 /login, /login → 200)

---

## 다음 단계: Phase 1

Phase 1: Foundation (Auth + Settings + DB CRUD)
1. 사용자 초대 기능 (Supabase invite_user_by_email)
2. Settings - Organizations CRUD
3. Settings - Products CRUD
4. Settings - Users 관리
