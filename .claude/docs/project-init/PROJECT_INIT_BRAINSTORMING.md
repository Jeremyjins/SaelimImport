# Saelim Import Management System - Initial Brainstorming

**Date:** 2026-03-06
**Status:** Initial Architecture Brainstorming
**Next Step:** 각 Phase별 상세 브레인스토밍 진행

---

## 1. System Overview

**Business Flow:**
```
CHP (Taiwan, Supplier) ──PO──> GV International (Intermediary) ──PI──> Saelim (Korean Buyer)
                                      │
                         수입 통관 처리 + 배송 관리
```

대만 제지사 CHP의 Glassine Paper를 GV International이 구매(PO)하여, 한국의 세림에게 판매(PI)하고, 선적/통관/배송까지 관리하는 시스템.

---

## 2. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect-notes.md](../brainstorm/architect-notes.md) | 시스템 아키텍처, DB 스키마, 모듈 연결, 개발 단계 |
| 2 | **Frontend Dev** | [frontend-notes.md](../brainstorm/frontend-notes.md) | 라우팅, UI 패턴, 컴포넌트 설계, Tiptap/TanStack |
| 3 | **Backend Dev** | [backend-notes.md](../brainstorm/backend-notes.md) | Supabase 스키마, RLS, RPC, 마이그레이션, Storage |
| 4 | **Security Reviewer** | [security-notes.md](../brainstorm/security-notes.md) | Auth, RLS 정책, 데이터 격리, API 보안 |
| 5 | **Researcher** | [research-notes.md](../brainstorm/research-notes.md) | PDF 생성, 한국어 폰트, Tiptap, TanStack Query |

**제외:** Tester (코드 없음), Perf-analyzer (시기상조), Code-reviewer (코드 없음)

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (SSR, file-based routing) |
| Runtime | Cloudflare Workers (Edge) |
| Styling | TailwindCSS v4 + Shadcn/ui (new-york) |
| State | TanStack Query (mutations, cache) |
| Editor | Tiptap (rich text, image D&D, file upload) |
| Database | Supabase (PostgreSQL + RLS + RPC) |
| Auth | Supabase Auth (email, invite-only recommended) |
| Storage | Supabase Storage (images, attachments, signatures) |
| PDF | @react-pdf/renderer (client-side) + Korean font subset |
| Hosting | Cloudflare Workers |

---

## 4. Core Data Flow

```
Purchase Order (PO)        GV → CHP 구매
        │
        ▼ (참조생성)
Proforma Invoice (PI)      GV → Saelim 판매
        │
        ├──▶ Delivery (자동생성)    배송관리
        │
        ▼ (참조생성)
Shipping Document          CI/PL 선적서류
        │
        ├──▶ Stuffing List         롤별 스터핑 정보
        │
        ▼ (참조생성)
Customs (통관)              통관비용 관리
        │
        ▼
Order Management           종합 관리 (모든 모듈 집계)
```

### Bi-directional Sync Points
- **Customs ↔ Order:** 통관 생성 → 오더 통관일/통관번호 업데이트, 통관비수령 양방향 sync
- **Shipping ↔ Order:** 선적서류 생성/수정 → 오더 vessel/voyage/etd/eta 업데이트
- **Delivery ↔ Order:** 배송일 변경 → 오더 배송일 업데이트
- **Delivery Change Request:** 세림 요청 → GV 승인/반려 → 배송일 업데이트

---

## 5. Database Schema Overview

### Core Entities

```
organizations          users              products
├─ id                  ├─ id              ├─ id
├─ type (supplier/     ├─ name            ├─ name
│  seller/buyer)       ├─ email           ├─ gsm
├─ name_en/ko          ├─ org_id (FK)     └─ width_mm
├─ address_en/ko       └─ role
├─ phone/fax
└─ signature_url
```

### Document Chain

```
purchase_orders ──────────> proforma_invoices ──────> shipping_documents
├─ po_no (GVPOYYMM-XXX)    ├─ pi_no (GVPIYYMM-XXX)  ├─ ci_no/pl_no
├─ supplier_id (CHP)        ├─ supplier_id (GV)       ├─ shipper_id (GV)
├─ buyer_id (GV)            ├─ buyer_id (Saelim)      ├─ consignee_id (Saelim)
├─ details (JSONB)          ├─ po_id (FK, nullable)   ├─ pi_id (FK)
├─ status                   ├─ details (JSONB)        ├─ vessel/voyage/etd/eta
└─ ...공통필드               └─ status                 ├─ weights/package_no
                                                      └─ status
        │                           │                         │
        └──────────┐                │                         │
                   ▼                ▼                         ▼
              orders (집계)    deliveries             stuffing_lists
              ├─ po_id         ├─ pi_id               ├─ shipping_doc_id
              ├─ pi_id         ├─ shipping_doc_id      ├─ cntr_no/seal_no
              ├─ shipping_id   ├─ delivery_date        ├─ roll_details (JSONB)
              ├─ customs_id    └─ ...                   └─ ...
              ├─ delivery_id
              ├─ saelim_no              customs
              └─ dates...               ├─ shipping_doc_id
                                        ├─ customs_no/date
                                        ├─ fees (JSONB each)
                                        └─ fee_received
```

### Content System (Polymorphic)

```
contents                    content_attachments      comments
├─ id                       ├─ content_id (FK)       ├─ content_id (FK)
├─ type (po/pi/ship/        ├─ file_url              ├─ body
│  order/customs)           ├─ file_name             ├─ created_by
├─ parent_id                └─ file_size             └─ created_at
├─ title
├─ body (JSONB/Tiptap)
└─ created_by

delivery_change_requests
├─ delivery_id (FK)
├─ requested_date
├─ reason
├─ status (pending/approved/rejected)
├─ response_text
├─ requested_by / responded_by
```

### Key Schema Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Line items (details) | **JSONB** | 품목 수가 적고 (1-5개), 독립 쿼리 불필요 |
| Fee breakdown | **JSONB** `{supply, vat, total}` | 구조가 고정되어 있고 개별 쿼리 불필요 |
| Contents | **Polymorphic table** with type | 모든 모듈에서 동일한 컨텐츠 패턴 재사용 |
| Document numbers | **DB function** | 동시성 안전한 시퀀스 생성 |
| Sync strategy | **Application-level** (server actions) | 투명성, 디버깅 용이 |

---

## 6. Development Phases

### Phase 1: Foundation (Auth + Settings + DB)
**Dependencies:** None
**Scope:**
- Supabase 프로젝트 설정 (Auth, Storage)
- 전체 DB 마이그레이션 (모든 테이블 생성)
- RLS 정책 설정
- Auth: Supabase email auth (invite-only 권장)
- Settings CRUD: Organizations, Products, Users
- Base layout: Shadcn Sidebar + responsive shell
- Seed data: CHP, GV, Saelim 조직 정보

### Phase 2: Purchase Order (PO)
**Dependencies:** Phase 1
**Scope:**
- PO CRUD (create, read, update, delete)
- 자동 번호 생성 (GVPOYYMM-XXX)
- PO List (status filter: 전체/진행/완료)
- PO Detail 페이지
- PO Clone 기능
- Status toggle

### Phase 3: Proforma Invoice (PI)
**Dependencies:** Phase 2 (PO 참조 생성)
**Scope:**
- PI CRUD
- PO 참조 생성 모드 (가격 제외 복제)
- PI List + Detail
- PI 생성 시 Delivery 자동 생성

### Phase 4: Contents System
**Dependencies:** Phase 1 (can parallel with Phase 2-3)
**Scope:**
- Tiptap 에디터 통합 (StarterKit + Image + FileHandler)
- 이미지 D&D → Supabase Storage 업로드
- 파일 첨부 관리
- Comments 시스템
- 모든 모듈에서 공유 사용

### Phase 5: Shipping Documents
**Dependencies:** Phase 3 (PI 참조 생성)
**Scope:**
- Shipping Doc CRUD (CI/PL)
- PI 참조 생성 모드
- Stuffing List CRUD
- CSV 업로드로 Stuffing List 생성
- Roll detail 관리

### Phase 6: Order Management
**Dependencies:** Phase 2 + 3 + 5
**Scope:**
- PO 선택하여 Order 생성
- 연결된 PI/Shipping/Customs/Delivery 정보 집계
- CY 체류일 계산 (14일 Free Time 경고)
- 양방향 sync 로직
- Order Detail (linked documents navigation)

### Phase 7: Customs Management
**Dependencies:** Phase 5 + 6
**Scope:**
- Shipping Doc 선택하여 Customs 생성
- 비용 입력 (운송비/통관비/부가세/기타)
- 통관비 수령 관리 (Order와 양방향 sync)
- Order 자동 업데이트

### Phase 8: Delivery Management
**Dependencies:** Phase 3 + 5 + 6
**Scope:**
- GV 배송관리 (전체 정보)
- Saelim 배송관리 (제한된 view)
- 배송일 변경 요청 workflow
  - 세림: 요청 (날짜, 사유)
  - GV: 승인/반려 (사유)
- 변경 히스토리

### Phase 9: PDF Generation
**Dependencies:** Phase 2-7 (모든 문서 모듈)
**Scope:**
- PO PDF, PI PDF
- Commercial Invoice PDF, Packing List PDF
- Stuffing List PDF
- Customs Invoice PDF
- 한국어 폰트 최적화 (Noto Sans KR subset)

### Phase 10: Polish & QA
**Dependencies:** All phases
**Scope:**
- Mobile responsive 최적화
- Error handling 강화
- 성능 최적화
- E2E 테스트

---

## 7. Architecture Decisions & Considerations

### 7.1 Auth Strategy
- **Recommended:** Supabase Auth invite-only (DISABLE_SIGNUP=true)
- Admin이 사용자 계정 생성 (5-10명 소규모)
- user_metadata에 org_id 저장 → RLS에서 참조
- Session: Supabase session cookie → Cloudflare Workers에서 검증

### 7.2 RLS (Row Level Security)
- **GV users:** 모든 테이블 full CRUD
- **Saelim users:** deliveries SELECT, delivery_change_requests INSERT/SELECT(own)
- 모든 RLS는 `auth.jwt() -> 'user_metadata' -> 'org_id'` 기반
- Application-level에서도 route guard 적용 (defense in depth)

### 7.3 PDF Generation
- **Primary:** `@react-pdf/renderer` (client-side)
- **Korean Font:** Noto Sans KR subset (~500-800KB, 비즈니스 용어 중심)
- **Fallback:** Supabase Edge Function + pdf-lib (서버사이드)
- **Alternative:** Browser print API (window.print() styled page)

### 7.4 File Storage
| Bucket | Access | Content |
|--------|--------|---------|
| `signatures` | Private (RLS) | 서명 이미지 |
| `content-images` | Public (with path-based RLS) | Tiptap 인라인 이미지 |
| `attachments` | Private (RLS) | 파일 첨부 |

### 7.5 Document Number Generation
```sql
-- Postgres function for safe concurrent number generation
generate_doc_number(type TEXT, ref_date DATE) → TEXT
-- e.g., generate_doc_number('PO', '2026-03-06') → 'GVPO2603-001'
-- Uses SELECT MAX + 1 within a serializable transaction
```

### 7.6 Reusable Patterns
- **List → Detail → Edit:** 모든 문서 모듈 동일 패턴
- **Status Filter:** 전체/진행/완료 탭 공통
- **Reference Creation:** PO→PI, PI→Shipping 데이터 복제 패턴
- **Contents Section:** 모든 Detail 페이지 하단 공통
- **Shared Form Fields:** currency, amount, terms, ports

---

## 8. Route Structure

```
app/routes/
├─ _auth.login.tsx                    # 로그인
├─ _layout.tsx                        # Sidebar layout (GV)
├─ _layout.settings.tsx               # 설정
├─ _layout.settings.organizations.tsx
├─ _layout.settings.products.tsx
├─ _layout.settings.users.tsx
├─ _layout.po.tsx                     # PO List
├─ _layout.po.$id.tsx                 # PO Detail
├─ _layout.po.new.tsx                 # PO Create
├─ _layout.po.$id.edit.tsx            # PO Edit
├─ _layout.pi.tsx                     # PI List
├─ _layout.pi.$id.tsx
├─ _layout.pi.new.tsx
├─ _layout.pi.$id.edit.tsx
├─ _layout.shipping.tsx               # Shipping List
├─ _layout.shipping.$id.tsx
├─ _layout.shipping.new.tsx
├─ _layout.shipping.$id.edit.tsx
├─ _layout.orders.tsx                 # Order List
├─ _layout.orders.$id.tsx
├─ _layout.customs.tsx                # Customs List
├─ _layout.customs.$id.tsx
├─ _layout.customs.new.tsx
├─ _layout.customs.$id.edit.tsx
├─ _layout.delivery.tsx               # GV Delivery List
├─ _layout.delivery.$id.tsx
├─ _saelim.tsx                        # Saelim layout (restricted)
├─ _saelim.delivery.tsx               # Saelim Delivery List
├─ _saelim.delivery.$id.tsx
└─ _layout.contents.$id.tsx           # Content Detail + Comments
```

---

## 9. Component Architecture

```
app/components/
├─ ui/                     # Shadcn/ui base components
├─ layout/
│   ├─ app-sidebar.tsx     # Main sidebar navigation
│   ├─ page-container.tsx  # Page wrapper
│   └─ header.tsx
├─ shared/
│   ├─ document-list.tsx   # Reusable list with status filter
│   ├─ document-detail.tsx # Reusable detail layout
│   ├─ document-form.tsx   # Shared form fields
│   ├─ status-toggle.tsx   # Process/Complete switch
│   ├─ content-editor.tsx  # Tiptap wrapper
│   ├─ content-list.tsx    # Contents section for detail pages
│   ├─ comment-section.tsx
│   ├─ pdf-button.tsx
│   └─ file-uploader.tsx
├─ po/                     # PO-specific components
├─ pi/                     # PI-specific components
├─ shipping/               # Shipping-specific components
├─ orders/                 # Order-specific components
├─ customs/                # Customs-specific components
└─ delivery/               # Delivery-specific components
```

---

## 10. Security Highlights

1. **Invite-only auth** - 공개 회원가입 비활성화
2. **RLS everywhere** - DB 레벨에서 데이터 격리
3. **Route guards** - Loader에서 org 체크 (defense in depth)
4. **Server-only Supabase** - 민감한 작업은 server loader/action에서만
5. **No client-side Supabase key for sensitive ops**
6. **File upload validation** - 타입/크기 제한
7. **Saelim 데이터 격리** - PO 가격, 통관 비용 등 접근 불가
8. **Cloudflare Workers secrets** - 환경 변수 안전 관리

---

## 11. Open Questions & Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | PDF 한국어 폰트 전략 | Client subset / Edge Function / Browser print | Client subset으로 시작 |
| 2 | Sync 방식 | Postgres triggers / App-level | App-level (투명성) |
| 3 | Auth 방식 | Open signup / Invite-only | Invite-only |
| 4 | TanStack Query 범위 | Loader only / Loader + Query | Loader for SSR + Query for mutations |
| 5 | Tiptap collaboration | Real-time collab / No | No (소규모 팀) |
| 6 | Audit log | Yes / No | Phase 10에서 결정 |
| 7 | 알림 시스템 | Email / In-app / None | 배송변경요청 시 in-app 알림 고려 |

---

## 12. Detailed Notes by Team Member

각 팀원별 상세 분석은 아래 파일 참조:
- [Architect Notes](../brainstorm/architect-notes.md)
- [Frontend Dev Notes](../brainstorm/frontend-notes.md)
- [Backend Dev Notes](../brainstorm/backend-notes.md)
- [Security Review Notes](../brainstorm/security-notes.md)
- [Research Notes](../brainstorm/research-notes.md)
- [Best Practice 기반 개선 아이디어](../brainstorm/improvements.md)

---

## 13. Next Steps

1. **Phase 1 상세 브레인스토밍** - Auth + Settings + DB 마이그레이션 상세 설계
2. **Supabase 프로젝트 생성** - MCP를 통해 직접 진행
3. **DB 마이그레이션 작성** - 전체 테이블 스키마 확정 후 실행
4. **UI Wireframe** - Shadcn Sidebar 기반 레이아웃 프로토타입
