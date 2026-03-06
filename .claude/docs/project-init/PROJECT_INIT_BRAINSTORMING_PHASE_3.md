# Saelim Import Management System - Phase 3 상세 브레인스토밍

**Date:** 2026-03-06
**Status:** Phase 3 상세 설계 완료
**참조:** [종합 브레인스토밍](PROJECT_INIT_BRAINSTORMING.md)

---

## 1. Phase 3 개요

### 정의
Phase 3는 **Proforma Invoice (PI)** 모듈 구현. PO(구매주문)에서 파생되는 판매 견적서.
GV International이 Saelim에게 발행하는 문서로, PO와 거의 동일한 CRUD 패턴을 따르되
PI 고유의 비즈니스 로직(PO 참조 생성, Delivery 자동 생성, 가격 격리)을 반영한다.

### 비즈니스 흐름
```
CHP (Taiwan)  ──PO(구매단가)──>  GV International  ──PI(판매단가)──>  Saelim (Korea)
                                       │
                                  PI 생성 시 Delivery 자동 생성
```

### 의존성
- Phase 2 (PO 모듈) 완료 필수
- DB 테이블/인덱스/RLS는 Phase 0에서 이미 생성

---

## 2. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect.md](../brainstorm/phase3/architect.md) | 전체 설계, DB 스키마 차이, 서브페이즈, 컴포넌트 전략 |
| 2 | **Frontend Dev** | [frontend.md](../brainstorm/phase3/frontend.md) | UI/UX, 컴포넌트 재사용, PO 참조 UI, 목록/상세/폼 디자인 |
| 3 | **Backend Dev** | [backend.md](../brainstorm/phase3/backend.md) | 서버 로직, Supabase 쿼리, Zod 스키마, Delivery 자동 생성 |
| 4 | **Security Reviewer** | [security.md](../brainstorm/phase3/security.md) | 가격 격리, RLS 검증, 위협 모델, Saelim 접근 제어 |
| 5 | **Researcher** | [researcher.md](../brainstorm/phase3/researcher.md) | 트랜잭션 패턴, FK join 타입, 마크업 관리, ERP 참조 패턴 |

**제외:** Tester (코드 미존재), Perf-analyzer (시기상조), Code-reviewer (코드 미존재)

---

## 3. PI vs PO 핵심 차이

### 3.1 스키마 비교

| 항목 | PO (`purchase_orders`) | PI (`proforma_invoices`) |
|------|----------------------|-------------------------|
| 번호 형식 | GVPOYYMM-XXX | GVPIYYMM-XXX |
| 날짜 필드 | `po_date` | `pi_date` |
| Supplier | CHP (type=supplier) | GV (type=seller) |
| Buyer | GV (type=seller) | Saelim (type=buyer) |
| 가격 의미 | 구매단가 | 판매단가 (마크업 적용) |
| FK 참조 | 없음 | `po_id` (nullable) |
| 자동 생성 | 없음 | Delivery 자동 생성 |
| JSONB details | 동일 구조 | 동일 구조 (단가 의미만 상이) |

### 3.2 DB 테이블 (Phase 0에서 생성 완료)

```sql
-- proforma_invoices: purchase_orders와 동일 구조 + po_id FK
-- deliveries: pi_id + shipping_doc_id + delivery_date
-- 인덱스: idx_pi_status, idx_pi_po_id, idx_pi_created_at, idx_deliveries_pi_id
-- RLS: gv_all 정책만 (Saelim 접근 불가)
-- RPC: generate_doc_number('PI', ref_date) 지원
```

추가 마이그레이션 불필요.

---

## 4. PO -> PI 참조 생성 설계

### 4.1 데이터 매핑

| PO 필드 | PI 필드 | 복사 방식 |
|---------|---------|----------|
| `po.id` | `po_id` | FK 연결 |
| `po_no` | `ref_no` | 참조번호로 복사 |
| - | `pi_date` | 오늘 날짜 (신규) |
| - | `pi_no` | 자동 생성 (RPC) |
| `buyer_id` (GV) | `supplier_id` | 역할 변경: GV가 PI supplier |
| Saelim org | `buyer_id` | Saelim이 PI buyer |
| `currency` | `currency` | 복사 |
| `payment_term` | `payment_term` | 복사 |
| `delivery_term` | `delivery_term` | 복사 |
| `loading_port` | `loading_port` | 복사 |
| `discharge_port` | `discharge_port` | 복사 |
| `details[].product_*` | `details[].product_*` | 복사 |
| `details[].quantity_kg` | `details[].quantity_kg` | 복사 |
| `details[].unit_price` | `details[].unit_price` | PO 단가를 기본값 (사용자 수정 가능) |

### 4.2 진입점 (이중)

1. **PO 상세 -> "PI 작성" 버튼**: `/pi/new?from_po={id}` (가장 자연스러운 워크플로우)
2. **PI 목록 -> "PI 작성" 버튼**: `/pi/new` (독립 생성)

### 4.3 구현 흐름

```
1. PO 상세 -> "PI 작성" 클릭
2. /pi/new?from_po={po_id} 이동
3. piFormLoader:
   - from_po searchParam 감지
   - PO 데이터 fetch (products, terms, ports, details)
   - sourcePO로 반환
4. PIForm:
   - sourcePO.details를 defaultValues.details에 매핑
   - supplier: GV (seller) 기본 선택
   - buyer: Saelim (buyer) 기본 선택
   - po_id: hidden input으로 전달
   - "PO에서 정보를 가져왔습니다. 판매단가를 확인하세요." 안내 표시
```

---

## 5. PI -> Delivery 자동 생성

### 5.1 결정: 순차 INSERT (RPC 트랜잭션 불필요)

**근거:**
- Supabase JS SDK는 클라이언트 수준 트랜잭션 미지원
- Delivery INSERT는 `pi_id` 단일 필드로 실패 가능성 극히 낮음
- 프로젝트 원칙: "application-level sync, not DB triggers"
- 향후 Phase 6 (Orders) 시점에서 RPC 트랜잭션 도입 검토

### 5.2 Flow

```
PI Create Action:
1. FormData 파싱 + Zod 검증
2. Org 활성 검증
3. po_id 참조 유효성 (있을 경우)
4. Amount 서버사이드 재계산
5. PI 번호 생성 (generate_doc_number RPC)
6. PI INSERT -> success -> pi.id 획득
7. Delivery INSERT (pi_id: pi.id) -> success
8. redirect -> /pi/{id}

실패 시:
- Step 6 실패: 에러 반환 (Delivery 미생성)
- Step 7 실패: PI soft delete (롤백) + 에러 반환
```

### 5.3 PI 삭제 시

PI soft delete 시 연결된 Delivery도 함께 soft delete (application-level).

---

## 6. 컴포넌트 전략

### 6.1 결정: Copy+Modify (공통 추출하지 않음)

**근거:**
- 프로젝트 소규모 (PO, PI 두 모듈)
- 차이점 실재: 라벨, supplier/buyer 역할 역전, PO 참조 셀렉터, 참고단가 표시
- Phase 5 (Shipping) 이후 3+ 모듈에서 공통 패턴 확인 시 추출 재검토

### 6.2 컴포넌트 매핑

| PO 컴포넌트 | PI 대응 | 전략 |
|-------------|---------|------|
| `po-form.tsx` | `pi-form.tsx` | Copy+Modify (PO 참조 프리필, 라벨 변경) |
| `po-line-items.tsx` | `pi-line-items.tsx` | Copy+Modify (PO 참고단가 표시 옵션) |
| `po-detail-info.tsx` | `pi-detail-info.tsx` | Copy+Modify (PO 연결 표시 추가) |
| `po-detail-items.tsx` | `pi-detail-items.tsx` | Copy+Modify (최소 변경) |
| `doc-status-badge.tsx` | 재사용 | 완전 재사용 |

### 6.3 공유 스키마

`lineItemSchema`는 `po.schema.ts`에서 export하여 `pi.schema.ts`에서 import 재사용.
PI 전용 `piSchema`만 별도 정의.

---

## 7. 라우트 구조

### 7.1 신규 라우트

```
/pi              -> PI 목록 (탭필터 + 검색) - 현재 placeholder 교체
/pi/new          -> PI 직접 생성
/pi/new?from_po= -> PO에서 PI 참조 생성
/pi/:id          -> PI 상세
/pi/:id/edit     -> PI 수정
```

### 7.2 routes.ts 추가

```typescript
route("pi/new", "routes/_layout.pi.new.tsx"),
route("pi/:id", "routes/_layout.pi.$id.tsx"),
route("pi/:id/edit", "routes/_layout.pi.$id.edit.tsx"),
```

### 7.3 기존 라우트 수정

- `_layout.po.$id.tsx`: "PI 작성" 버튼 추가 + 연결 PI 목록 표시
- `_layout.po.$id.server.ts` (또는 pi.server.ts에서 처리): PO에 연결된 PI 조회

---

## 8. UI 디자인

### 8.1 PI 목록 테이블

**Desktop 컬럼:** PI번호 | 일자 | PO번호 | 바이어 | 통화 | 총액 | 상태

**Mobile 카드:**
```
┌─────────────────────────────────┐
│ GVPI2603-001          [진행]    │
│ PO: GVPO2603-001  |  2026.03.06│
│                   $12,345.00    │
└─────────────────────────────────┘
```

### 8.2 PI 생성 폼

PO 폼과 동일한 2열 레이아웃:
- 왼쪽 카드: 기본 정보 (PI 일자, 유효기간, 참조번호)
- 오른쪽 카드: 거래 조건 (판매자, 구매자, 통화, 결제/인도조건, 항구)
- 품목 카드: 라인아이템 편집기
- 비고 카드: 메모
- PO 참조 시: 상단에 파란색 안내 배너

### 8.3 PI 상세 페이지

PO 상세와 동일 구조:
- Header: PI번호 + 상태뱃지 + 토글버튼 + 드롭다운(수정/복제/PI작성/삭제)
- 기본정보 카드 (2열): 참조 PO 링크 포함
- 품목 테이블
- 비고
- 메타 정보 (작성일/수정일)

---

## 9. 서버 로직 핵심

### 9.1 파일 구조

```
app/types/pi.ts                # PILineItem, PIWithOrgs, PIListItem, PIEditData
app/loaders/pi.schema.ts       # piSchema (lineItemSchema는 po.schema에서 import)
app/loaders/pi.server.ts       # loader(목록) + piFormLoader(폼) + createPIAction(생성+Delivery)
app/loaders/pi.$id.server.ts   # loader(상세) + piEditLoader(수정) + action(update/delete/clone/toggle)
```

### 9.2 PI List Loader

```typescript
const { data: pis } = await supabase
  .from("proforma_invoices")
  .select(
    "id, pi_no, pi_date, status, amount, currency, " +
    "supplier:organizations!supplier_id(name_en), " +
    "buyer:organizations!buyer_id(name_en), " +
    "po:purchase_orders!po_id(po_no)"
  )
  .is("deleted_at", null)
  .order("pi_date", { ascending: false })
  .order("created_at", { ascending: false });
```

**타입 캐스팅:** `as unknown as { pis: PIListItem[] }` (GenericStringError 대응)

### 9.3 PI Form Loader

```typescript
const url = new URL(request.url);
const fromPoId = url.searchParams.get("from_po");

// suppliers: type='seller' (GV)
// buyers: type='buyer' (Saelim)
// sourcePO: fromPoId가 있으면 PO 데이터 fetch
```

### 9.4 Create PI Action

PO createPOAction과 동일 패턴 + 추가:
1. `po_id` 참조 유효성 검증 (있을 경우)
2. PI INSERT 후 Delivery 자동 INSERT
3. Delivery 실패 시 PI soft delete 롤백

### 9.5 PI Action (상세 페이지)

PO action과 동일 인텐트 패턴:
- `update`: complete 상태 수정 차단
- `delete`: PI soft delete + Delivery soft delete
- `clone`: po_id는 null로 초기화 + Delivery 자동 생성
- `toggle_status`: DB에서 현재 status 조회 후 토글

---

## 10. 보안 핵심

### 10.1 이중 가격 격리

| 데이터 | 민감도 | 보호 방법 |
|--------|--------|----------|
| PO 구매단가 | Critical | purchase_orders RLS (Saelim 접근 불가) |
| PI 판매단가 | Critical | proforma_invoices RLS (Saelim 접근 불가) |
| Delivery 정보 | Public | Saelim SELECT 허용 (가격 컬럼 제외) |

### 10.2 이중 방어 필수

모든 PI loader/action에서 `requireGVUser` 독립 호출:
```typescript
const { supabase, responseHeaders } = await requireGVUser(request, context);
```

`_layout.tsx` 레이아웃 가드만으로 불충분 (직접 HTTP 호출 우회 가능).

### 10.3 Saelim Delivery 뷰

Saelim delivery loader에서 PI 가격 관련 컬럼 명시적 제외:
- `pi.details[].unit_price` 절대 금지
- `pi.amount` 절대 금지
- `pi.po_id` 절대 금지 (PO 역추적)

### 10.4 구현 전 검증

```sql
-- proforma_invoices에 Saelim SELECT 정책 없음 확인
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('proforma_invoices', 'deliveries');
```

---

## 11. 구현 서브페이즈

### Phase 3-A: PI 목록 + 직접 생성

**범위:**
- `app/types/pi.ts` - 타입 정의
- `app/loaders/pi.schema.ts` - Zod 스키마
- `app/loaders/pi.server.ts` - loader + piFormLoader + createPIAction
- `app/components/pi/pi-line-items.tsx` - 라인아이템 편집기
- `app/components/pi/pi-form.tsx` - PI 폼 (PO 참조 프리필 지원)
- `app/routes/_layout.pi.tsx` - PI 목록 (placeholder 교체)
- `app/routes/_layout.pi.new.tsx` - PI 생성
- `app/routes.ts` - 라우트 추가

**산출물:**
- PI 목록 (탭필터 + 검색 + Desktop테이블 + Mobile카드)
- PI 직접 생성 + PO 참조 생성 (?from_po=xxx)
- PI 생성 시 Delivery 자동 생성

### Phase 3-B: PI 상세 + 수정 + 크로스모듈

**범위:**
- `app/loaders/pi.$id.server.ts` - loader + piEditLoader + action
- `app/components/pi/pi-detail-info.tsx` - 상세 정보 카드
- `app/components/pi/pi-detail-items.tsx` - 품목 테이블
- `app/routes/_layout.pi.$id.tsx` - PI 상세
- `app/routes/_layout.pi.$id.edit.tsx` - PI 수정
- `app/routes/_layout.po.$id.tsx` 수정: "PI 작성" 버튼 + 연결 PI 목록

**산출물:**
- PI 상세 (Optimistic Toggle, Clone, Delete)
- PI 수정 (complete 상태 수정 차단)
- PO 상세에서 "PI 작성" 진입점
- PO 상세에서 연결 PI 목록 표시

---

## 12. 파일 생성 체크리스트

### 신규 생성
```
app/types/pi.ts                        # PILineItem, PIWithOrgs, PIListItem, PIEditData
app/loaders/pi.schema.ts               # piSchema
app/loaders/pi.server.ts               # PI 목록 + 폼 + 생성 서버 로직
app/loaders/pi.$id.server.ts           # PI 상세 + 수정 + 액션 서버 로직
app/components/pi/pi-form.tsx           # PI 폼 (PO 참조 프리필)
app/components/pi/pi-line-items.tsx     # 라인아이템 편집기
app/components/pi/pi-detail-info.tsx    # 상세 정보 2열 카드
app/components/pi/pi-detail-items.tsx   # 품목 읽기전용 테이블
app/routes/_layout.pi.new.tsx           # PI 생성 페이지
app/routes/_layout.pi.$id.tsx           # PI 상세 페이지
app/routes/_layout.pi.$id.edit.tsx      # PI 수정 페이지
```

### 수정
```
app/routes/_layout.pi.tsx               # placeholder -> 실제 목록
app/routes.ts                           # PI 라우트 추가
app/routes/_layout.po.$id.tsx           # "PI 작성" 버튼 + 연결 PI 목록
app/loaders/po.$id.server.ts            # 연결 PI 조회 추가 (선택적)
```

---

## 13. 주요 기술 결정 요약

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| 1 | 컴포넌트 전략 | Copy+Modify (PI 전용) | 소규모, premature abstraction 방지 |
| 2 | lineItemSchema | po.schema에서 import 재사용 | 구조 동일, 중복 제거 |
| 3 | 트랜잭션 | 순차 INSERT (RPC 미사용) | Delivery 실패 가능성 극히 낮음 |
| 4 | PO 참조 진입점 | URL searchParams (?from_po=) | SSR 호환, 단순 |
| 5 | PI 단가 기본값 | PO 단가를 기본값 제공 | UX 마찰 감소 |
| 6 | FK join 타입 | as unknown as 캐스팅 | PO 선례, Phase 10에서 개선 |
| 7 | 마크업 관리 | 수동 입력 | Phase 3에서 충분 |
| 8 | PI 삭제 시 Delivery | 함께 soft delete | 고아 레코드 방지 |
| 9 | Clone 시 po_id | null로 초기화 | 클론은 독립 PI |

---

## 14. 열린 질문

| # | 질문 | 권장 |
|---|------|------|
| 1 | PI 폼에서 PO 참고단가 컬럼 표시? | 간단하게 표시 (선택적, Phase 3-A에서 미구현도 가능) |
| 2 | PI 목록 검색 범위 | PI번호 + PO번호 (둘 다) |
| 3 | PO complete 상태에서 PI 생성 허용? | 허용 (PO 완료 후 PI 발행 자연스러움) |
| 4 | Saelim에게 PI 번호(pi_no) 노출? | 불허 (GV 내부 문서) |
| 5 | PO에서 PI 여러 건 생성 가능? | 허용 (동일 PO에서 수정 버전 PI 가능) |

---

## 15. 에이전트별 상세 노트

| Agent | File | 주요 내용 |
|-------|------|----------|
| Architect | [architect.md](../brainstorm/phase3/architect.md) | 전체 설계, 스키마 비교, 서브페이즈, 리스크 |
| Frontend Dev | [frontend.md](../brainstorm/phase3/frontend.md) | 컴포넌트 매핑, UI 디자인, 구현 순서 |
| Backend Dev | [backend.md](../brainstorm/phase3/backend.md) | 서버 로직, Supabase 쿼리, 코드 스니펫 |
| Security | [security.md](../brainstorm/phase3/security.md) | 위협 모델, 가격 격리, 체크리스트 |
| Researcher | [researcher.md](../brainstorm/phase3/researcher.md) | 트랜잭션, FK join, 마크업, ERP 패턴 |

---

## 16. Next Steps

1. **Phase 3-A 구현:** PI 목록 + 직접 생성 + PO 참조 생성 + Delivery 자동 생성
2. **Phase 3-B 구현:** PI 상세 + 수정 + 크로스모듈 (PO 상세에서 PI 연결)
3. **Phase 3 검증:** 전체 PI CRUD flow 테스트 + 보안 체크리스트 확인
4. **Phase 4 시작:** Contents System (Tiptap 에디터 통합)
