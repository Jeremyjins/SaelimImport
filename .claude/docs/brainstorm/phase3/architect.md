# Phase 3: PI Module - Architect Notes

**Date:** 2026-03-06
**Role:** Architect

---

## 1. PI vs PO Schema Comparison

| 항목 | PO (`purchase_orders`) | PI (`proforma_invoices`) |
|------|----------------------|-------------------------|
| 번호 | `po_no` (GVPOYYMM-XXX) | `pi_no` (GVPIYYMM-XXX) |
| 날짜 | `po_date` | `pi_date` |
| Supplier | CHP (type=supplier) | GV (type=seller) |
| Buyer | GV (type=seller) | Saelim (type=buyer) |
| 가격 의미 | 구매단가 (CHP->GV) | 판매단가 (GV->Saelim, 마크업) |
| FK 참조 | 없음 | `po_id` (nullable, PO 참조) |
| 자동 생성 | 없음 | PI 생성 -> Delivery 자동 생성 |
| JSONB details | 동일 구조 | 동일 구조 (단가 의미만 다름) |

공통 컬럼: validity, ref_no, currency, amount, payment_term, delivery_term, loading_port, discharge_port, details, notes, status, deleted_at, created_by, created_at, updated_at

---

## 2. PO -> PI 참조 생성 설계

### 복사 규칙

| PO 필드 | PI 필드 | 복사 여부 |
|---------|---------|----------|
| po.id | po_id | O (FK 연결) |
| po_no | ref_no | O (참조번호로) |
| po_date | pi_date | X (오늘 날짜) |
| supplier_id(CHP) | - | X (역할 변경) |
| buyer_id(GV) | supplier_id | O (GV가 PI의 supplier) |
| - | buyer_id | Saelim 기본 선택 |
| currency | currency | O |
| payment_term | payment_term | O |
| delivery_term | delivery_term | O |
| loading_port | loading_port | O |
| discharge_port | discharge_port | O |
| details[].product_* | details[].product_* | O |
| details[].quantity_kg | details[].quantity_kg | O |
| details[].unit_price | details[].unit_price | PO 단가를 기본값으로 (사용자 수정 가능) |
| details[].amount | details[].amount | X (재계산) |

### UX Flow

**권장: 이중 진입점**
1. PO 상세 -> "PI 작성" 버튼 -> `/pi/new?from_po={id}` (가장 자연스러운 워크플로우)
2. PI 목록 -> "PI 작성" 버튼 -> `/pi/new` (독립 생성)

PI 폼 loader에서 `from_po` searchParam 감지 -> PO 데이터 fetch -> defaultValues로 프리필.

---

## 3. PI -> Delivery 자동 생성

### 결정: 순차 INSERT (RPC 트랜잭션 불필요)

**근거:**
- `deliveries` 테이블의 `pi_id`는 nullable
- Delivery INSERT는 단일 필드(pi_id) 연결로 실패 가능성 극히 낮음
- 프로젝트 원칙: "application-level sync, not DB triggers"
- Supabase JS SDK는 클라이언트 수준 트랜잭션 미지원

**Flow:**
```
1. PI 번호 생성 (generate_doc_number RPC)
2. PI INSERT -> success -> pi.id 획득
3. Delivery INSERT (pi_id: pi.id) -> success
4. redirect -> /pi/{id}

실패 시:
- PI INSERT 실패 -> 에러 반환 (Delivery 생성 안함)
- Delivery INSERT 실패 -> PI soft delete (롤백) + 에러 반환
```

### PI 삭제 시 Delivery 처리

PI soft delete 시 연결된 Delivery도 함께 soft delete (application-level).

---

## 4. 라우트 구조

```
/pi                    -> PI 목록 (탭필터 + 검색)
/pi/new                -> PI 직접 생성
/pi/new?from_po=xxx    -> PO에서 PI 참조 생성
/pi/:id                -> PI 상세
/pi/:id/edit           -> PI 수정
```

routes.ts 추가:
```typescript
route("pi/new", "routes/_layout.pi.new.tsx"),
route("pi/:id", "routes/_layout.pi.$id.tsx"),
route("pi/:id/edit", "routes/_layout.pi.$id.edit.tsx"),
```

---

## 5. 컴포넌트 재사용 전략

### 결정: PI 전용 컴포넌트 (Copy+Modify)

**근거:**
- 프로젝트 소규모 (PO, PI 두 모듈만)
- 차이점이 미묘하지만 실재 (라벨, supplier/buyer 기본값, PO 참조 셀렉터)
- Premature abstraction 방지
- Phase 5 (Shipping Docs) 이후 공통화 재검토

| PO 컴포넌트 | PI 대응 | 전략 |
|-------------|---------|------|
| po-form.tsx | pi-form.tsx | Copy+Modify (PO 셀렉터 추가, 라벨 변경) |
| po-line-items.tsx | pi-line-items.tsx | Copy+Modify (PO 참고단가 표시 옵션) |
| po-detail-info.tsx | pi-detail-info.tsx | Copy+Modify (PO 연결 표시 추가) |
| po-detail-items.tsx | pi-detail-items.tsx | Copy+Modify (최소 변경) |
| doc-status-badge.tsx | 재사용 | 완전 재사용 |

---

## 6. 구현 서브페이즈

### Phase 3-A: PI 목록 + 직접 생성
- `app/types/pi.ts` - PILineItem, PIWithOrgs, PIListItem, PIEditData
- `app/loaders/pi.schema.ts` - piSchema (lineItemSchema는 po.schema에서 import)
- `app/loaders/pi.server.ts` - loader(목록), piFormLoader(폼용), createPIAction(생성+Delivery)
- `app/components/pi/pi-form.tsx` - PI 폼
- `app/components/pi/pi-line-items.tsx` - 라인아이템 편집기
- `app/routes/_layout.pi.tsx` - PI 목록 페이지
- `app/routes/_layout.pi.new.tsx` - PI 생성 페이지
- routes.ts 업데이트

### Phase 3-B: PI 상세 + 수정 + PO 참조 생성 + 크로스모듈
- `app/loaders/pi.$id.server.ts` - loader(상세), piEditLoader(수정), action(update/delete/clone/toggle)
- `app/components/pi/pi-detail-info.tsx` - 상세 정보 카드
- `app/components/pi/pi-detail-items.tsx` - 품목 테이블
- `app/routes/_layout.pi.$id.tsx` - PI 상세 페이지
- `app/routes/_layout.pi.$id.edit.tsx` - PI 수정 페이지
- PO 상세에 "PI 작성" 버튼 추가
- PO 상세에 연결된 PI 목록 표시

---

## 7. 주요 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Supabase FK join `!po_id` GenericStringError | 타입 추론 실패 | `as unknown as PIWithOrgs` 캐스팅 (PO 선례) |
| Nullable FK `po_id` join 시 null 반환 | 타입 안전성 | `po: { po_no: string } \| null` 명시 |
| Delivery INSERT 실패 | 고아 PI 레코드 | PI soft delete 롤백 |
| PO 구매단가 노출 | 보안 위반 | requireGVUser 필수, RLS 검증 |
