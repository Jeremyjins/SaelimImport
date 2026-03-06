# Phase 3-A 구현계획: PI 목록 + 직접 생성

**Date:** 2026-03-06
**Status:** ✅ 구현 완료 (2026-03-06)
**참조:** [Phase 3 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_3.md)

---

## 팀 구성

| 역할 | 담당 파일 |
|------|----------|
| Architect | 전체 설계 감독, 파일 구조 |
| Frontend Dev | pi-form.tsx, pi-line-items.tsx, _layout.pi.tsx, _layout.pi.new.tsx |
| Backend Dev | pi.schema.ts, pi.server.ts, types/pi.ts |

---

## Task 목록

### T1: 타입 정의 - `app/types/pi.ts`
- [x] PILineItem (POLineItem과 동일 구조, 의미만 다름 - 판매단가)
- [x] PIWithOrgs (상세 페이지용, po 조인 포함)
- [x] PIListItem (목록용, po:purchase_orders!po_id(po_no) 조인)
- [x] PIEditData (수정 페이지용)

### T2: Zod 스키마 - `app/loaders/pi.schema.ts`
- [x] lineItemSchema는 po.schema.ts에서 import 재사용
- [x] piSchema 정의 (po_id 추가, 날짜 필드 pi_date)

### T3: 서버 로직 - `app/loaders/pi.server.ts`
- [x] loader: PI 목록 조회 (+ po:purchase_orders!po_id(po_no) 조인)
- [x] piFormLoader: 폼용 데이터 (suppliers: seller, buyers: buyer, sourcePO from ?from_po)
- [x] createPIAction: PI 생성 + Delivery 자동 생성 (실패 시 soft delete 롤백)

### T4: 라인아이템 편집기 - `app/components/pi/pi-line-items.tsx`
- [x] Copy+Modify from po-line-items.tsx
- [x] 라벨: "단가" (판매단가 의미)

### T5: PI 폼 컴포넌트 - `app/components/pi/pi-form.tsx`
- [x] Copy+Modify from po-form.tsx
- [x] "PI 일자" 라벨 변경
- [x] Supplier 선택 (GV seller 기본)
- [x] Buyer 선택 (Saelim buyer)
- [x] po_id hidden input 지원
- [x] sourcePO 정보 표시 배너
- [x] PO 단가를 기본값으로 제공

### T6: PI 목록 페이지 - `app/routes/_layout.pi.tsx`
- [x] placeholder 교체 → 실제 PI 목록
- [x] 탭필터 (전체/진행/완료)
- [x] 검색 (PI번호 + PO번호)
- [x] Desktop 테이블: PI번호 | 일자 | PO번호 | 바이어 | 통화 | 총액 | 상태
- [x] Mobile 카드: PI번호 + 상태, PO번호 + 일자, 금액

### T7: PI 생성 페이지 - `app/routes/_layout.pi.new.tsx`
- [x] PIForm 렌더링
- [x] sourcePO 프리필 지원 (?from_po=xxx)

### T8: 라우트 추가 - `app/routes.ts`
- [x] pi/new 라우트 추가
- [x] pi/:id 라우트 추가 (placeholder)
- [x] pi/:id/edit 라우트 추가 (placeholder)

### T9: Pencil 디자인 - saelim.pen
- [x] PI 목록 화면 디자인
- [x] PI 생성 화면 디자인

---

## 핵심 설계 결정

### DB/Supabase
- `proforma_invoices`: id, pi_no, pi_date, validity, ref_no, supplier_id, buyer_id, currency, amount, payment_term, delivery_term, loading_port, discharge_port, details, notes, status, po_id, created_by
- `deliveries`: id, pi_id (PI 생성 시 자동 INSERT)
- RLS: proforma_invoices → gv_all only (Saelim 접근 불가)
- RLS: deliveries → gv_all + saelim_read (SELECT만)

### 조직 역할 (PI에서 역전)
- Supplier (판매자): type='seller' (GV International)
- Buyer (구매자): type='buyer' (Saelim)

### PO 참조 생성 (?from_po=xxx)
- piFormLoader에서 PO 데이터 fetch → sourcePO로 반환
- PIForm에서 sourcePO.details를 defaultValues.details에 매핑
- 파란색 안내 배너 표시

### Delivery 자동 생성
- PI INSERT 성공 후 deliveries INSERT
- Delivery 실패 시 PI soft delete 롤백

### 타입 캐스팅
- FK join 결과는 `as unknown as { pis: PIListItem[] }` 패턴 사용

---

## 구현 완료 파일

| 파일 | 상태 | 비고 |
|------|------|------|
| `app/types/pi.ts` | ✅ 완료 | |
| `app/loaders/pi.schema.ts` | ✅ 완료 | |
| `app/loaders/pi.server.ts` | ✅ 완료 | |
| `app/components/pi/pi-line-items.tsx` | ✅ 완료 | |
| `app/components/pi/pi-form.tsx` | ✅ 완료 | |
| `app/routes/_layout.pi.tsx` | ✅ 완료 | |
| `app/routes/_layout.pi.new.tsx` | ✅ 완료 | |
| `app/routes.ts` | ✅ 완료 | |
| Pencil 디자인 (saelim.pen) | ✅ 완료 | PI List, PI New |
