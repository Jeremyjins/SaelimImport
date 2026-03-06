# Phase 3: PI Module - Frontend Dev Notes

**Date:** 2026-03-06
**Role:** Frontend Dev

---

## 1. Component Strategy: Copy+Modify

**결정: PI 전용 컴포넌트 생성 (POForm에서 공통 DocumentForm 추출하지 않음)**

근거:
- PO와 PI 차이가 미묘하지만 실재 (라벨, PO 참조 셀렉터, supplier/buyer 기본값 역전)
- 프로젝트 소규모 (모듈 2개)에서 premature abstraction은 오히려 복잡도 증가
- Phase 5 (Shipping Docs) 구현 후 3개 이상 모듈에서 공통 패턴 확인 시 추출 재검토

---

## 2. 파일 구조

### 신규 파일

```
app/types/pi.ts                       # PILineItem, PIWithOrgs, PIListItem, PIEditData
app/loaders/pi.schema.ts              # piSchema (lineItemSchema는 po.schema에서 import)
app/loaders/pi.server.ts              # loader + piFormLoader + createPIAction
app/loaders/pi.$id.server.ts          # loader + piEditLoader + action
app/components/pi/pi-form.tsx          # PI 폼 (PO 참조 프리필 지원)
app/components/pi/pi-line-items.tsx    # 라인아이템 편집기 (PO 참고단가 표시)
app/components/pi/pi-detail-info.tsx   # PI 상세 정보 카드
app/components/pi/pi-detail-items.tsx  # PI 품목 테이블 (읽기전용)
app/routes/_layout.pi.tsx              # PI 목록 (수정: 현재 placeholder)
app/routes/_layout.pi.new.tsx          # PI 생성
app/routes/_layout.pi.$id.tsx          # PI 상세
app/routes/_layout.pi.$id.edit.tsx     # PI 수정
```

### 수정 파일

```
app/routes.ts                          # PI 라우트 추가
app/routes/_layout.po.$id.tsx          # "PI 작성" 버튼 + 연결 PI 목록
```

### 공유 재사용

```
app/components/shared/doc-status-badge.tsx  # 완전 재사용
app/loaders/po.schema.ts                   # lineItemSchema export 재사용
app/lib/format.ts                          # formatDate, formatCurrency
app/components/layout/*                    # Header, PageContainer
```

---

## 3. PI 목록 페이지

PO 목록과 동일 구조 + PI 고유 표시 항목:

### Desktop 테이블 컬럼

| 컬럼 | 설명 |
|------|------|
| PI 번호 | pi_no (font-medium) |
| 일자 | pi_date |
| PO 번호 | po.po_no (nullable, 없으면 "-") |
| 바이어 | buyer.name_en |
| 통화 | currency |
| 총액 | amount (text-right, tabular-nums) |
| 상태 | DocStatusBadge |

### Mobile 카드

```
┌─────────────────────────────────┐
│ GVPI2603-001          [진행]    │
│ PO: GVPO2603-001  |  2026.03.06│
│                   $12,345.00    │
└─────────────────────────────────┘
```

### 검색

PI 번호 + PO 번호 동시 검색:
```typescript
const matchSearch = search === "" ||
  po.pi_no.toLowerCase().includes(searchLower) ||
  (po.po?.po_no?.toLowerCase().includes(searchLower) ?? false);
```

---

## 4. PI 생성 페이지 (두 가지 모드)

### 4.1 직접 생성: `/pi/new`

빈 폼. supplier는 GV(seller) 기본 선택, buyer는 Saelim(buyer) 기본 선택.

### 4.2 PO 참조 생성: `/pi/new?from_po={id}`

loader에서 PO 데이터 fetch -> defaultValues 프리필.

**PO 참조 생성 시 UI 안내:**
```tsx
{sourcePO && (
  <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
    PO {sourcePO.po_no}에서 정보를 가져왔습니다. 판매단가를 확인하세요.
  </div>
)}
```

### 4.3 PIForm 인터페이스

```typescript
interface PIFormProps {
  suppliers: Organization[];     // sellers (GV)
  buyers: Organization[];        // buyers (Saelim)
  products: Product[];
  error?: string | null;
  defaultValues?: {
    pi_date?: string;
    validity?: string;
    ref_no?: string;
    po_id?: string;              // PO 참조 시 hidden input
    supplier_id?: string;
    buyer_id?: string;
    currency?: string;
    payment_term?: string;
    delivery_term?: string;
    loading_port?: string;
    discharge_port?: string;
    notes?: string;
    details?: PILineItem[];
  };
  sourcePO?: {                   // PO 참조 생성 시 원본 정보
    id: string;
    po_no: string;
  } | null;
  submitLabel?: string;
  actionName?: string;
  cancelTo?: string;
}
```

### 4.4 PIForm vs POForm 차이점

| 항목 | POForm | PIForm |
|------|--------|--------|
| 날짜 라벨 | "PO 일자" | "PI 일자" |
| supplier 라벨 | "공급업체" | "판매자 (Shipper)" |
| buyer 라벨 | "구매업체" | "구매자 (Buyer)" |
| supplier 목록 | type='supplier' | type='seller' (GV) |
| buyer 목록 | type in ['seller','buyer'] | type='buyer' (Saelim) |
| PO 참조 | 없음 | hidden input po_id + PO 번호 표시 |
| 참고단가 표시 | 없음 | PO에서 참조 시 참고단가 컬럼 (옵션) |

---

## 5. PI 상세 페이지

PO 상세와 동일 구조 + PI 고유 요소:

### 추가 요소

1. **연결된 PO 표시**: po_id가 있으면 PO 번호를 Link로 표시
   ```tsx
   {pi.po && (
     <div className="flex items-center gap-2 text-sm text-zinc-500">
       <span>참조 PO:</span>
       <Link to={`/po/${pi.po.id}`} className="text-blue-600 hover:underline">
         {pi.po.po_no}
       </Link>
     </div>
   )}
   ```

2. **PIDetailInfo 카드**: PO의 2열 레이아웃과 동일하되 라벨 변경
   - "공급업체" -> "판매자", "구매업체" -> "구매자"

### 액션 (PO와 동일)

- 상태 토글 (진행/완료)
- 수정 (complete 시 차단)
- 복제 (po_id는 null로 초기화)
- 삭제 (AlertDialog 확인 -> Delivery 함께 soft delete)

---

## 6. PO 상세 페이지 수정 (크로스모듈)

### Phase 3 범위에 포함

1. **"PI 작성" 버튼**: PO 상세 드롭다운 메뉴에 추가
   ```tsx
   <DropdownMenuItem asChild>
     <Link to={`/pi/new?from_po=${po.id}`}>
       <FileText className="mr-2 h-4 w-4" />
       PI 작성
     </Link>
   </DropdownMenuItem>
   ```

2. **연결된 PI 목록**: PO 상세 하단에 관련 PI 카드 표시
   - PO detail loader에서 연결된 PI 목록 추가 조회
   - 간단한 리스트 (PI번호 + 일자 + 상태 + 금액)
   - Link to PI 상세

---

## 7. 구현 순서

### Phase 3-A (PI 목록 + 생성)
1. `app/types/pi.ts` 타입 정의
2. `app/loaders/pi.schema.ts` Zod 스키마
3. `app/loaders/pi.server.ts` 서버 로직 (목록 + 폼 + 생성)
4. `app/components/pi/pi-line-items.tsx` 라인아이템 편집기
5. `app/components/pi/pi-form.tsx` PI 폼
6. `app/routes/_layout.pi.tsx` PI 목록 (현재 placeholder 교체)
7. `app/routes/_layout.pi.new.tsx` PI 생성
8. `app/routes.ts` 라우트 추가

### Phase 3-B (PI 상세 + 수정 + 크로스모듈)
1. `app/loaders/pi.$id.server.ts` 서버 로직 (상세 + 수정 + 액션)
2. `app/components/pi/pi-detail-info.tsx` 상세 정보 카드
3. `app/components/pi/pi-detail-items.tsx` 품목 테이블
4. `app/routes/_layout.pi.$id.tsx` PI 상세
5. `app/routes/_layout.pi.$id.edit.tsx` PI 수정
6. PO 상세 수정: "PI 작성" 버튼 + 연결 PI 목록
