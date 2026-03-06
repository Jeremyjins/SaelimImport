# Phase 2-C 구현 계획: PO Edit + Clone + Status Toggle

**Date:** 2026-03-06
**Status:** 완료 (Phase 2-B에서 통합 구현됨)
**참조:** [Phase 2 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_2.md) | [Phase 2-B 구현](PROJECT_INIT_IMPLEMENT_PHASE_2-B.md)

---

## 1. 구현 범위

Phase 2-B 구현 시 Phase 2-C 기능을 통합 구현 완료. 별도 구현 불필요.

| 기능 | 상태 | 구현 파일 |
|------|------|----------|
| PO 수정 (Edit) | ✅ 완료 | `app/loaders/po.$id.server.ts` (handleUpdate) + `app/routes/_layout.po.$id.edit.tsx` |
| PO 복제 (Clone) | ✅ 완료 | `app/loaders/po.$id.server.ts` (handleClone) → `/po/{newId}/edit` redirect |
| 상태 토글 (Toggle) | ✅ 완료 | `app/loaders/po.$id.server.ts` (handleToggleStatus) + Optimistic UI |

---

## 2. 에이전트 팀 구성

이 단계는 Phase 2-B에서 이미 구현됨. Phase 2-C 문서는 검증 및 폴리시 작업용으로 사용.

| 팀원 | 역할 | 담당 파일 |
|------|------|----------|
| **Frontend Dev** | PO List 폴리시 (SPA 네비게이션 수정) | `app/routes/_layout.po.tsx` |
| **Code Reviewer** | 코드 검토 및 중복 제거 | - |

---

## 3. 파일 소유권 (File Ownership)

| # | 파일 | Owner | 설명 |
|---|------|-------|------|
| 1 | `app/routes/_layout.po.tsx` | Frontend | `window.location.href` → `useNavigate` 수정 + 공용 format 함수 사용 |

---

## 4. Task 목록

### Phase 2-C 기능 (Phase 2-B에서 완료)

- [x] **T1: `app/loaders/po.$id.server.ts` - poEditLoader 구현**
  - PO + suppliers/buyers/products 조회
  - 소프트 삭제된 PO 404 처리

- [x] **T2: `app/loaders/po.$id.server.ts` - update action 구현**
  - 완료 PO 수정 차단
  - JSONB details Zod 검증
  - Amount 서버사이드 재계산
  - 성공 시 `/po/:id` redirect

- [x] **T3: `app/loaders/po.$id.server.ts` - clone action 구현**
  - 원본 PO 데이터 복사
  - `generate_doc_number` RPC로 새 번호 생성
  - status를 "process"로 리셋
  - 성공 시 `/po/{newId}/edit` redirect

- [x] **T4: `app/loaders/po.$id.server.ts` - toggle_status action 구현**
  - process ↔ complete 토글
  - redirect 없이 revalidation (data 반환)

- [x] **T5: `app/routes/_layout.po.$id.edit.tsx` 구현**
  - `poEditLoader`로 기존 데이터 로드
  - `POForm`에 `defaultValues` pre-fill
  - `actionName="update"` 전달

- [x] **T6: `app/routes/_layout.po.$id.tsx` - Optimistic Toggle UI**
  - `fetcher.formData?.get("_action") === "toggle_status"` 체크
  - Optimistic status 계산

### Phase 2-D Polish (이번 단계 수행)

- [x] **T7: `app/routes/_layout.po.tsx` - SPA 네비게이션 수정**
  - `window.location.href` → `useNavigate` (React Router SPA 네비게이션)
  - `formatDate` / `formatAmount` → 공용 `format.ts` 함수 사용

---

## 5. 구현 핵심 패턴 (Phase 2-C)

### 5.1 Edit 페이지 - defaultValues
```typescript
<POForm
  defaultValues={{
    po_date: po.po_date,
    validity: po.validity ?? "",
    supplier_id: po.supplier_id,
    // ... 나머지 필드
    details: po.details,
  }}
  submitLabel="수정"
  actionName="update"
/>
```

### 5.2 Clone - redirect to edit
```typescript
// clone action
throw redirect(`/po/${cloned.id}/edit`, { headers: responseHeaders });
```

### 5.3 Optimistic Toggle
```typescript
const isToggling = fetcher.state !== "idle" && currentAction === "toggle_status";
const optimisticStatus = isToggling
  ? po.status === "process" ? "complete" : "process"
  : po.status;
```

### 5.4 완료 PO 수정 차단
```typescript
if (existing?.status === "complete") {
  return data({ success: false, error: "완료 처리된 PO는 수정할 수 없습니다." }, { status: 400 });
}
```

---

## 6. 보안 체크리스트

- [x] 모든 loader/action에서 `requireGVUser` 호출
- [x] URL params `id`를 `z.string().uuid()`로 검증
- [x] 소프트 삭제된 PO 수정/복제 차단 (`.is("deleted_at", null)`)
- [x] amount 서버사이드 재계산 (클라이언트 값 무시)
- [x] complete 상태 PO 수정 차단
- [x] responseHeaders 모든 redirect/data에 포함

---

## 7. 구현 결과

### 구현된 파일 (Phase 2-B에서)
- `app/loaders/po.$id.server.ts` - poEditLoader + update/clone/toggle_status action
- `app/routes/_layout.po.$id.edit.tsx` - PO 수정 페이지
- `app/routes/_layout.po.$id.tsx` - Optimistic Toggle + Clone + Delete

### 폴리시 수정 (Phase 2-D, 이번 단계)
- `app/routes/_layout.po.tsx` - `useNavigate` 사용, 공용 formatCurrency 적용

### 완료 기준
- [x] `npm run typecheck` 에러 없음
- [x] `npm run dev` 정상 동작
- [x] PO 수정 동작 (완료 PO 차단 포함)
- [x] PO 복제 → edit 페이지로 redirect
- [x] 상태 토글 (Optimistic UI)
- [x] PO List SPA 네비게이션 수정
