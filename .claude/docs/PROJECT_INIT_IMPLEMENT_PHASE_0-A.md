# Phase 0-A 구현계획: Supabase 인프라

**Date:** 2026-03-06
**Status:** 완료
**참조:** [Phase 0 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_0.md)

---

## 에이전트 팀 구성

| 역할 | 담당 | 파일 소유권 |
|------|------|------------|
| Backend Dev | Supabase MCP 마이그레이션, RLS, RPC, Storage, Seed | `supabase/migrations/`, `app/types/database.ts` |
| Architect | workers/app.ts Env 타입, root.tsx, app.css 수정 | `workers/app.ts`, `app/root.tsx`, `app/app.css` |

---

## Task 목록

### Task 1: Supabase 프로젝트 확인 [완료]
- [x] `list_organizations` - 기존 org 확인
- [x] `list_projects` - "Saelim Import Management" 기존 프로젝트 확인 (scgdomybgngenuunikac)
- [x] `get_project_url` - https://scgdomybgngenuunikac.supabase.co
- [x] `get_publishable_keys` - anon key 확인

### Task 2: DB 마이그레이션 (10개) [완료]
- [x] 001_extensions_and_helpers - moddatetime, update_updated_at(), get_user_org_type(), get_user_org_id()
- [x] 002_core_tables - organizations, products, user_profiles, document_sequences
- [x] 003_document_tables - purchase_orders, proforma_invoices, deliveries, shipping_documents, stuffing_lists, customs, orders
- [x] 004_content_system - contents, content_attachments, comments
- [x] 005_delivery_changes - delivery_change_requests
- [x] 006_rls_policies - 모든 테이블 RLS 활성화 및 정책 (gv: 전체 접근, saelim: 제한 접근)
- [x] 007_rpc_functions - generate_doc_number (concurrent-safe, advisory lock 사용)
- [x] 008_indexes - 성능 인덱스 16개
- [x] 009_storage_buckets - signatures(private), content-images(public), attachments(private)
- [x] 010_seed_data - CHP, GV International, Saelim Co. 초기 데이터

### Task 3: TypeScript 타입 생성 [완료]
- [x] `generate_typescript_types` → `app/types/database.ts` 생성

### Task 4: 환경 설정 [완료]
- [x] `.dev.vars` - 이미 존재, SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY 모두 설정됨
- [x] `workers/app.ts` - Env 인터페이스 추가 (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- [x] `app/root.tsx` - lang="ko", Pretendard Variable Dynamic Subset CDN 폰트로 교체
- [x] `app/app.css` - --font-sans: "Pretendard Variable" 으로 업데이트

---

## 구현 결과

### Supabase 프로젝트 정보
- **Project ID:** scgdomybgngenuunikac
- **Project URL:** https://scgdomybgngenuunikac.supabase.co
- **Region:** ap-northeast-2 (서울)
- **Status:** ACTIVE_HEALTHY

### 생성된 테이블 (15개)
| 테이블 | 설명 |
|--------|------|
| organizations | 거래처 (supplier/seller/buyer) |
| products | 제품 (GSM, 너비, HS코드) |
| user_profiles | 사용자 프로필 (auth.users 확장) |
| document_sequences | 문서번호 시퀀스 |
| purchase_orders | 구매주문서 (PO) |
| proforma_invoices | 견적송장 (PI) |
| deliveries | 배송 |
| shipping_documents | 선적서류 (CI/PL) |
| stuffing_lists | 스터핑 리스트 |
| customs | 통관 |
| orders | 오더 (통합 뷰) |
| delivery_change_requests | 배송 변경 요청 |
| contents | 콘텐츠 (첨부/노트) |
| content_attachments | 첨부파일 |
| comments | 댓글 |

### 생성된 RPC 함수
- `generate_doc_number(doc_type, ref_date)` - 문서번호 자동 생성 (GV{type}{YYMM}-{seq})
- `get_user_org_type()` - JWT app_metadata에서 org_type 조회
- `get_user_org_id()` - JWT app_metadata에서 org_id 조회

### Storage 버킷
- `signatures` (private) - 서명 이미지
- `content-images` (public) - 콘텐츠 이미지
- `attachments` (private) - 첨부파일

### 생성/수정된 파일
| 파일 | 상태 | 내용 |
|------|------|------|
| `app/types/database.ts` | 신규 생성 | Supabase 자동생성 TypeScript 타입 |
| `.dev.vars` | 기존 파일 유지 | SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY |
| `workers/app.ts` | 수정 | Env 인터페이스 3개 키 추가 |
| `app/root.tsx` | 수정 | lang="ko", Pretendard CDN 폰트 |
| `app/app.css` | 수정 | --font-sans Pretendard Variable |

---

## Phase 0-A 완료 기준 (DoD) - 전체 달성

- [x] Supabase 프로젝트 확인 (기존 ACTIVE_HEALTHY)
- [x] 모든 테이블 마이그레이션 완료 (15개 테이블)
- [x] RLS 정책 모든 테이블 적용
- [x] RPC 함수 `generate_doc_number` 생성
- [x] Storage 버킷 3개 생성
- [x] Seed 데이터 투입 (CHP, GV, Saelim organizations)
- [x] TypeScript 타입 `app/types/database.ts` 생성
- [x] `.dev.vars` 환경변수 파일 확인
- [x] `workers/app.ts` Env 타입 업데이트
- [x] `root.tsx` lang="ko" + Pretendard 폰트
- [x] `app.css` --font-sans 업데이트

---

## 다음 단계: Phase 0-B

Phase 0-B: 프로젝트 의존성 & 설정
1. `@supabase/supabase-js`, `@supabase/ssr`, `zod` npm 설치
2. Shadcn/ui 컴포넌트 설치 (sidebar, button, card, input, label, dialog, dropdown-menu, avatar, sonner 등)
