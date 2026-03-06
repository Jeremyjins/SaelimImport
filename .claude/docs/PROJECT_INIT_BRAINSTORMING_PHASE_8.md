# Phase 8: Delivery Management - Comprehensive Brainstorming

**Date:** 2026-03-06
**Status:** Brainstorming Complete
**Next Step:** Phase 8-A 구현

---

## 1. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect-notes.md](brainstorm/phase8/architect-notes.md) | DB 스키마, 데이터 흐름, 라우트 구조, 구현 단계 |
| 2 | **Frontend Dev** | [frontend-notes.md](brainstorm/phase8/frontend-notes.md) | GV/Saelim UI, 컴포넌트 구조, 반응형 디자인 |
| 3 | **Backend Dev** | [backend-notes.md](brainstorm/phase8/backend-notes.md) | Loader/Action, Sync 로직, Zod 스키마, RLS |
| 4 | **Security Reviewer** | [security-notes.md](brainstorm/phase8/security-notes.md) | 데이터 격리, RLS, 변경요청 보안, 공격 벡터 |
| 5 | **Researcher** | [research-notes.md](brainstorm/phase8/research-notes.md) | UX 패턴, 듀얼 레이아웃, 날짜 선택, 최적 UI |

**제외:** Tester (코드 없음), Perf-analyzer (시기상조), Code-reviewer (코드 없음)

---

## 2. Executive Summary

Phase 8은 **두 가지 고유한 특성**을 가진 모듈:

1. **듀얼 포털**: GV (전체 관리) + Saelim (제한된 뷰 + 변경요청)
2. **외부 사용자 쓰기 권한**: Saelim이 처음으로 DB에 INSERT 수행 (delivery_change_requests)

### 핵심 결정사항

| 결정 | 선택 | 근거 |
|------|------|------|
| Delivery 생성 | PI 생성 시 자동 (기존 패턴) | 1:1 관계, 수동 생성 불필요 |
| 편집 방식 | Detail 페이지 인라인 편집 | 필드 3개 미만, Edit 라우트 불필요 |
| 변경요청 승인 | 자동으로 delivery_date 업데이트 | 수동 2단계 방지, requested_date가 곧 새 날짜 |
| Saelim 데이터 격리 | 가격 정보 완전 차단 | RLS + Application-level SELECT 제한 |
| Loader 파일 분리 | GV / Saelim 완전 분리 | Auth, 데이터 형태, Action 집합 모두 다름 |
| ContentSection | GV Detail에서 사용 | 기존 시스템 재활용, 스키마 추가 불필요 |
| 알림 시스템 | 시각적 뱃지만 (별도 시스템 X) | 소규모 팀(5-10명), Phase 10에서 재평가 |

---

## 3. 기존 스키마 평가

### deliveries 테이블 (이미 존재)
```
id, pi_id (FK→PI), shipping_doc_id (FK→Shipping), delivery_date, created_at, updated_at, deleted_at
```
**평가**: 기본적으로 충분. `status` 컬럼 추가 검토 필요.

### delivery_change_requests 테이블 (이미 존재)
```
id, delivery_id (FK→deliveries), requested_date, reason, status (pending/approved/rejected),
requested_by, responded_by, response_text, created_at, updated_at
```
**평가**: 충분. `responded_at` 컬럼 존재 여부 확인 필요 (database.ts에 미반영).

### 스키마 변경 옵션

**옵션 A (최소 변경 - 권장):**
- `deliveries.status` 추가: `pending | scheduled | delivered`
- `responded_at` 컬럼 확인/추가
- RLS 정책 + 인덱스만 추가

**옵션 B (확장):**
- 옵션 A + `delivery_address` (TEXT), `notes` (TEXT) 추가
- 하지만 ContentSection으로 notes 대체 가능, address는 배송지가 고정적이면 불필요

---

## 4. 데이터 흐름

### Delivery Lifecycle
```
PI 생성 ──자동──> Delivery 생성 (status: pending, pi_id 설정)
                     │
Shipping 생성 ───────┤──> shipping_doc_id 연결
                     │
GV 날짜 설정 ────────┤──> delivery_date 설정, status: scheduled
                     │    └──> order.delivery_date 동기화
                     │
Saelim 변경요청 ─────┤──> delivery_change_request 생성 (pending)
                     │
GV 승인 ─────────────┤──> delivery_date 업데이트 + 요청 status: approved
                     │    └──> order.delivery_date 동기화
                     │
GV 배송확인 ─────────┘──> status: delivered
```

### 양방향 Sync
- **Delivery → Order**: `syncDeliveryDateToOrder()` (기존 존재)
- **Order → Delivery**: `syncDeliveryDateFromOrder()` (신규 필요 - 현재 버그)
- **Delete 시**: `unlinkDeliveryFromOrder()` (신규 필요)

### 현재 버그 (Phase 8-A에서 수정)
`orders.$id.server.ts`의 `update_fields` 액션이 `orders.delivery_date`를 변경하지만
`deliveries.delivery_date`에는 동기화하지 않음. 역방향 sync 추가 필요.

---

## 5. 라우트 구조

### 라우트 설정 (`routes.ts` 추가)
```typescript
// GV Layout
route("delivery/:id", "routes/_layout.delivery.$id.tsx"),   // NEW

// Saelim Layout
route("saelim/delivery/:id", "routes/_saelim.delivery.$id.tsx"), // NEW
```

### Loader/Action 파일

| File | Auth | Purpose |
|------|------|---------|
| `delivery.server.ts` | requireGVUser | GV 배송 목록 |
| `delivery.$id.server.ts` | requireGVUser | GV 배송 상세 + 승인/반려/삭제 |
| `saelim.delivery.server.ts` | requireAuth + org_type | Saelim 배송 목록 |
| `saelim.delivery.$id.server.ts` | requireAuth + org_type | Saelim 배송 상세 + 변경요청 |
| `delivery.schema.ts` | N/A | Zod 스키마 |

### Action Intent 요약

**GV Detail:**
| Intent | Description |
|--------|-------------|
| `update_delivery_date` | 인라인 날짜 수정 |
| `approve_request` | 변경요청 승인 → 자동 날짜 변경 |
| `reject_request` | 변경요청 반려 (사유 필수) |
| `delete` | Soft delete + order unlink |
| `content_*` | 콘텐츠 시스템 위임 |

**Saelim Detail:**
| Intent | Description |
|--------|-------------|
| `submit_change_request` | 변경요청 제출 (날짜 + 사유) |

---

## 6. UI 설계

### GV 배송 목록 (`_layout.delivery.tsx`)
- **패턴**: Orders 목록과 동일 (상태 필터 탭 + 테이블/카드)
- **탭**: 전체 / 진행(pending+scheduled) / 완료(delivered)
- **Desktop 테이블 컬럼**: PI번호, CI번호, 선박명, 배송일, 변경요청(대기 건수 뱃지), 상태
- **Mobile**: 카드 레이아웃 (PI번호, CI, 배송일, 뱃지)
- **검색**: PI번호, CI번호

### GV 배송 상세 (`_layout.delivery.$id.tsx`)
- **Header**: PI번호 기반 타이틀, backTo="/delivery", 상태뱃지 + 변경요청 카운트 뱃지
- **Section 1**: 배송 정보 Card (PI 링크, Shipping 링크, 배송일 인라인 편집)
- **Section 2**: 변경요청 내역 Card (최신순, 대기 건 승인/반려 버튼)
- **Section 3**: ContentSection (type="delivery")
- **Section 4**: 메타 정보 (생성일, 수정일)

### Saelim 배송 목록 (`_saelim.delivery.tsx`)
- **패턴**: 심플 카드 리스트 (사이드바 없음, `max-w-3xl mx-auto`)
- **정보**: PI번호, CI번호, 배송일, 변경요청 상태
- **가격 정보 없음**: amount, currency, details 일체 제외

### Saelim 배송 상세 (`_saelim.delivery.$id.tsx`)
- **Section 1**: 배송 정보 (읽기 전용 - PI번호, CI번호, 배송일)
- **Section 2**: 변경요청 제출 Form (날짜 선택 + 사유 Textarea)
- **Section 3**: 내 변경요청 내역 (상태별 색상 뱃지)
- **No ContentSection**: Saelim은 콘텐츠 접근 불가

### 변경요청 상태 색상
```typescript
const REQUEST_STATUS = {
  pending:  { label: "대기", className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "승인", className: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "거부", className: "bg-red-100 text-red-700 border-red-200" },
};
```

---

## 7. 컴포넌트 구조

### 신규 컴포넌트 (`app/components/delivery/`)

| Component | Description | Used by |
|-----------|-------------|---------|
| `change-request-card.tsx` | 개별 변경요청 표시 (showActions prop) | GV + Saelim |
| `change-request-badge.tsx` | 상태 뱃지 (대기/승인/거부) | 공유 |
| `change-request-form.tsx` | 날짜+사유 입력 폼 | Saelim Detail |
| `delivery-info-card.tsx` | 배송 기본 정보 (PI/Shipping 링크) | GV Detail |

### 재사용 기존 컴포넌트
- `Header`, `PageContainer`, `Card/*`, `Badge`, `Button`
- `AlertDialog` (삭제/승인/반려 확인)
- `ContentSection` (GV Detail)
- `Tabs/TabsList/TabsTrigger` (GV 목록 필터)
- `Table` 컴포넌트 (GV 목록 Desktop)
- `Input`, `Textarea`, `Label` (폼)
- Toast (`sonner`)

---

## 8. 보안 설계

### 핵심 보안 요구사항 (CRIT 등급)

1. **[CRIT-1] Saelim SELECT 제한**: PI/Shipping 조인 시 가격 필드 절대 제외
2. **[CRIT-2] 독립 Auth 검증**: 모든 Saelim loader/action에서 org_type 체크
3. **[CRIT-3] 소유권 검증**: requested_by = user.id 서버사이드 설정 (FormData 신뢰 금지)
4. **[CRIT-4] GV 전용 Action**: approve/reject는 requireGVUser 필수
5. **[CRIT-5] RLS 활성화**: 배포 전 deliveries + delivery_change_requests RLS 필수

### RLS 정책 요약

| Table | GV | Saelim |
|-------|-----|--------|
| deliveries | FOR ALL (full CRUD) | FOR SELECT only (deleted_at IS NULL) |
| delivery_change_requests | FOR ALL (full CRUD) | INSERT (requested_by=uid), SELECT (requested_by=uid) |

### 공격 벡터 대응

| 공격 | 방어 |
|------|------|
| 삭제된 배송에 요청 | App: deleted_at IS NULL 확인 |
| 자가 승인 | RLS: Saelim UPDATE 불가 |
| 타인 요청 수정 | RLS: requested_by=uid |
| 요청 스팸 | App: 대기 중 요청 있으면 거부 |
| 과거 날짜 요청 | App: requested_date > today 검증 |
| requested_by 스푸핑 | App: user.id 서버사이드 설정 |

---

## 9. DB Migration (Supabase MCP)

### Migration 1: Schema Enhancement (선택적)
```sql
-- deliveries.status 추가 (선택적 - 없으면 delivery_date 기반으로 파생)
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'scheduled', 'delivered'));

UPDATE deliveries SET status = 'scheduled'
  WHERE delivery_date IS NOT NULL AND deleted_at IS NULL;

-- responded_at 확인/추가
ALTER TABLE delivery_change_requests
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
```

### Migration 2: RLS + Indexes
```sql
-- RLS 활성화
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_change_requests ENABLE ROW LEVEL SECURITY;

-- deliveries 정책
CREATE POLICY "gv_deliveries_all" ON deliveries
  FOR ALL USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

CREATE POLICY "saelim_deliveries_select" ON deliveries
  FOR SELECT USING (get_user_org_type() = 'saelim' AND deleted_at IS NULL);

-- delivery_change_requests 정책
CREATE POLICY "gv_change_requests_all" ON delivery_change_requests
  FOR ALL USING (get_user_org_type() = 'gv')
  WITH CHECK (get_user_org_type() = 'gv');

CREATE POLICY "saelim_change_requests_select" ON delivery_change_requests
  FOR SELECT USING (get_user_org_type() = 'saelim' AND requested_by = auth.uid());

CREATE POLICY "saelim_change_requests_insert" ON delivery_change_requests
  FOR INSERT WITH CHECK (get_user_org_type() = 'saelim' AND requested_by = auth.uid());

-- 성능 인덱스
CREATE INDEX idx_deliveries_active ON deliveries (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_dcr_delivery_id ON delivery_change_requests (delivery_id);
CREATE INDEX idx_dcr_requested_by ON delivery_change_requests (requested_by);
CREATE INDEX idx_dcr_status_pending ON delivery_change_requests (delivery_id) WHERE status = 'pending';
```

### Post-Migration
```bash
npm run cf-typegen  # database.ts 재생성
```

---

## 10. 구현 단계

### Phase 8-A: GV Delivery Management

**목표**: GV 사용자가 배송을 조회, 관리, 업데이트할 수 있음

**Deliverables:**

1. **Schema Migration** (Supabase MCP)
   - RLS 정책 생성
   - 성능 인덱스 추가
   - `status` 컬럼 추가 (선택적)
   - `database.ts` 재생성

2. **Types + Content 확장**
   - `app/types/delivery.ts` 생성
   - `ContentType`에 `"delivery"` 추가
   - `PARENT_TABLE_MAP`에 `delivery: "deliveries"` 추가

3. **Sync 로직 강화**
   - `unlinkDeliveryFromOrder()` 추가
   - `syncDeliveryDateFromOrder()` 추가
   - `orders.$id.server.ts` 역방향 sync 연결

4. **Backend (GV)**
   - `delivery.schema.ts` (Zod 스키마)
   - `delivery.server.ts` (목록 loader)
   - `delivery.$id.server.ts` (상세 loader + action)

5. **Frontend (GV)**
   - `_layout.delivery.tsx` 플레이스홀더 교체 (실제 목록)
   - `_layout.delivery.$id.tsx` 신규 (상세 페이지)
   - `app/components/delivery/` 컴포넌트

6. **Route 등록**
   - `routes.ts`에 `delivery/:id` 추가

### Phase 8-B: Saelim Portal

**목표**: Saelim 사용자가 배송을 조회하고 변경요청을 제출할 수 있음

**Dependencies:** Phase 8-A

**Deliverables:**

1. **Backend (Saelim)**
   - `saelim.delivery.server.ts` (목록 loader)
   - `saelim.delivery.$id.server.ts` (상세 loader + action)

2. **Frontend (Saelim)**
   - `_saelim.delivery.tsx` 플레이스홀더 교체
   - `_saelim.delivery.$id.tsx` 신규
   - `change-request-form.tsx` 컴포넌트

3. **Route 등록**
   - `routes.ts`에 `saelim/delivery/:id` 추가

4. **RLS 검증**
   - Saelim 계정으로 수동 테스트
   - 가격 정보 접근 불가 확인
   - 타인 요청 조회 불가 확인

---

## 11. 파일 목록

### 신규 파일
```
app/types/delivery.ts
app/loaders/delivery.server.ts
app/loaders/delivery.$id.server.ts
app/loaders/delivery.schema.ts
app/loaders/saelim.delivery.server.ts
app/loaders/saelim.delivery.$id.server.ts
app/routes/_layout.delivery.$id.tsx
app/routes/_saelim.delivery.$id.tsx
app/components/delivery/change-request-card.tsx
app/components/delivery/change-request-badge.tsx
app/components/delivery/change-request-form.tsx
app/components/delivery/delivery-info-card.tsx
```

### 수정 파일
```
app/routes.ts                           # delivery/:id + saelim/delivery/:id 추가
app/routes/_layout.delivery.tsx         # 플레이스홀더 → 실제 목록
app/routes/_saelim.delivery.tsx         # 플레이스홀더 → 실제 목록
app/lib/order-sync.server.ts            # unlinkDeliveryFromOrder + syncDeliveryDateFromOrder 추가
app/loaders/orders.$id.server.ts        # 역방향 delivery_date sync 연결
app/types/content.ts                    # ContentType에 "delivery" 추가
app/lib/content.server.ts              # PARENT_TABLE_MAP에 delivery 추가
app/types/database.ts                   # 마이그레이션 후 재생성
```

---

## 12. 리스크 평가

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Saelim 가격 정보 노출 | Medium | Critical | SELECT 컬럼 명시적 제한 + 코드리뷰 |
| Order↔Delivery 날짜 sync 루프 | Low | Low | 서로 다른 테이블 업데이트, 무한루프 불가 |
| RLS 미적용 배포 | Medium | Critical | Phase 8-A 첫 단계에서 RLS 마이그레이션 |
| Order 인라인 수정 역방향 sync 누락 | High (현재 버그) | Medium | Phase 8-A에서 수정 |
| responded_at 컬럼 미존재 | Medium | Low | Supabase MCP로 확인 후 ADD IF NOT EXISTS |

---

## 13. 상세 노트 참조

각 팀원별 상세 분석:
- [Architect Notes](brainstorm/phase8/architect-notes.md) - 스키마, 데이터 흐름, 구현 단계
- [Frontend Notes](brainstorm/phase8/frontend-notes.md) - UI 설계, 컴포넌트, 반응형
- [Backend Notes](brainstorm/phase8/backend-notes.md) - Loader/Action 코드, Sync, RLS
- [Security Notes](brainstorm/phase8/security-notes.md) - 보안 체크리스트, 공격 벡터
- [Research Notes](brainstorm/phase8/research-notes.md) - UX 패턴, 기술 조사
