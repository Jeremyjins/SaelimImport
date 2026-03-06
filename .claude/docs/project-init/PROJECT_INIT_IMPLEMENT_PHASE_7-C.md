# Phase 7-C: Cross-Module Links + Polish - 구현계획

**Date:** 2026-03-06
**Status:** 완료

---

## 개요

Phase 7-A (Types/Schema/List/Create) + 7-B (Detail/Edit/Delete/Sync) 완료 후,
모듈 간 연결(Cross-Module Links)과 UX 완성도를 높이는 마무리 단계.

---

## 에이전트 팀 구성

Phase 7-C는 2개 파일 수정만 필요한 단순 구현으로, **단일 구현 에이전트**로 진행.

| 역할 | 담당 파일 |
|------|----------|
| Frontend Dev (리드) | `app/routes/_layout.shipping.$id.tsx`, `app/components/orders/order-doc-links.tsx` |

---

## 구현 범위

### Task 1: Shipping 상세 → "통관 생성" 버튼 추가 ✅

**파일:** `app/routes/_layout.shipping.$id.tsx`

**변경 내용:**
- 드롭다운 메뉴에 "통관 생성" 항목 추가 (복제 항목 다음, 구분선 위)
- `Link to={/customs/new?from_shipping={shipping.id}}` 패턴 사용
- `Receipt` 아이콘 활용 (이미 icons.tsx에 있음)

**구현 세부:**
```tsx
<DropdownMenuItem asChild>
  <Link to={`/customs/new?from_shipping=${shipping.id}`}>
    <Receipt className="mr-2 h-4 w-4" />
    통관 생성
  </Link>
</DropdownMenuItem>
```

### Task 2: Order 상세 Customs 카드 → 상세 링크 활성화 ✅

**파일:** `app/components/orders/order-doc-links.tsx`

**변경 내용:**
- customs DOC_CONFIG의 `getLink` 함수: `null` → `/customs/{order.customs_id}`
- `enabled: false` 유지 (수동 연결/해제는 auto-sync로만, Order에서 직접 연결 불필요)

**구현 전:**
```typescript
getLink: (_order) => null,
```

**구현 후:**
```typescript
getLink: (order) => (order.customs_id ? `/customs/${order.customs_id}` : null),
```

---

## 아키텍처 결정

### Shipping → Customs 연결 흐름
1. Shipping 상세에서 드롭다운 → "통관 생성" 클릭
2. `/customs/new?from_shipping={id}` 이동
3. CustomsForm: `from_shipping` 쿼리 파라미터 → Shipping 자동 선택 (7-A에서 구현됨)
4. 통관 생성 완료 → Order에 자동 연결 (linkCustomsToOrder, 7-B에서 구현됨)

### Order → Customs 연결 흐름
- Order 상세 Customs 카드에서 통관번호 클릭 → `/customs/{id}` 이동
- `enabled: false` 유지 이유: customs는 auto-sync로만 연결되므로 수동 링크 불필요

---

## 완료 기준

- [x] Shipping 상세 드롭다운에 "통관 생성" 메뉴 항목 추가
- [x] Order 상세 Customs 카드에서 통관번호 클릭 시 `/customs/{id}`로 이동
- [x] 구현계획 문서 작성 및 업데이트
