# Phase 2-B 구현 계획: PO Detail + Edit + Clone + Status Toggle

**Date:** 2026-03-06
**Status:** 구현 중
**참조:** [Phase 2 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_2.md)
**Phase 2-A 완료:** PO List + Create 완료

---

## 1. 구현 범위 (Phase 2-B + 2-C 통합)

Phase 2-B와 2-C를 통합 구현:
- **Phase 2-B:** PO 상세 조회 + 삭제
- **Phase 2-C:** PO 수정 + 복제 + 상태 토글

---

## 2. 에이전트 팀 구성

| 팀원 | 역할 | 담당 파일 |
|------|------|----------|
| **Architect** | 설계 검토, 통합 판단 | - |
| **Backend Dev** | Loader/Action 구현 | `app/loaders/po.$id.server.ts` |
| **Frontend Dev** | 컴포넌트/라우트 구현 | `app/components/po/po-detail-info.tsx`, `app/components/po/po-detail-items.tsx`, `app/routes/_layout.po.$id.tsx`, `app/routes/_layout.po.$id.edit.tsx`, `app/components/po/po-form.tsx` (수정) |
| **Security Reviewer** | 보안 체크 | - |

**제외 팀원:** Tester (별도 테스트 파일 없음), Perf-analyzer (시기상조), Code-reviewer (구현 후 검토 예정), Researcher (기존 브레인스토밍으로 충분)

---

## 3. 파일 소유권 (File Ownership)

| # | 파일 | Owner | 설명 |
|---|------|-------|------|
| 1 | `app/loaders/po.$id.server.ts` | Backend | Detail/Edit loader + 모든 actions |
| 2 | `app/components/po/po-detail-info.tsx` | Frontend | PO 기본정보 + 거래조건 카드 |
| 3 | `app/components/po/po-detail-items.tsx` | Frontend | 품목 내역 읽기 전용 테이블 |
| 4 | `app/routes/_layout.po.$id.tsx` | Frontend | PO 상세 페이지 |
| 5 | `app/routes/_layout.po.$id.edit.tsx` | Frontend | PO 수정 페이지 |
| 6 | `app/components/po/po-form.tsx` | Frontend | actionName prop 추가 |

---

## 4. Task 목록

### Backend Tasks

- [x] **T1: `app/loaders/po.$id.server.ts` 생성**
  - `loader`: PO 상세 조회 (supplier/buyer join, deleted_at 체크, 404)
  - `poEditLoader`: PO + 폼 데이터 (suppliers/buyers/products) 조회
  - `action`: multi-intent (update/delete/clone/toggle_status)
  - 보안: requireGVUser, UUID 검증, 완료 PO 수정 차단, 서버사이드 amount 재계산

### Frontend Tasks

- [x] **T2: `app/components/po/po-form.tsx` - actionName prop 추가**
  - `actionName?: string` prop 추가
  - hidden input `_action` 렌더링 (수정 모드 식별)

- [x] **T3: `app/components/po/po-detail-info.tsx` 생성**
  - 2열 카드: 기본정보 + 거래조건
  - formatDate 사용

- [x] **T4: `app/components/po/po-detail-items.tsx` 생성**
  - Desktop Table + Mobile 카드
  - 합계 행
  - formatCurrency 사용

- [x] **T5: `app/routes/_layout.po.$id.tsx` 구현**
  - Header: PO 번호, 뒤로가기, StatusBadge, Toggle버튼, 드롭다운(수정/복제/삭제)
  - fetcher로 toggle_status / clone / delete 처리
  - 삭제 AlertDialog
  - Optimistic UI (toggle_status)

- [x] **T6: `app/routes/_layout.po.$id.edit.tsx` 구현**
  - POForm with defaultValues pre-fill
  - actionName="update" 전달
  - 수정 후 /po/:id로 redirect

---

## 5. 구현 핵심 패턴

### 5.1 Loader 타입 캐스팅
```typescript
// 라우트에서 Supabase FK Join 타입 캐스팅
const { po } = useLoaderData<typeof loader>() as unknown as { po: POWithOrgs };
```

### 5.2 Action Multi-intent (switch)
```typescript
switch (intent) {
  case "update": ...
  case "delete": ...  → redirect("/po")
  case "clone":  ...  → redirect(`/po/${newId}/edit`)
  case "toggle_status": ... → data({ success: true }) // 리다이렉트 없음, revalidation
}
```

### 5.3 Fetcher 패턴 (Detail 페이지)
- `fetcher.submit({ _action: "toggle_status", current_status: po.status }, { method: "post" })`
- `fetcher.submit({ _action: "clone" }, { method: "post" })`
- `fetcher.submit({ _action: "delete" }, { method: "post" })`
- Optimistic UI: `fetcher.formData?.get("_action") === "toggle_status"`

### 5.4 완료 PO 수정 차단 (서버)
```typescript
if (existing?.status === "complete") {
  return data({ success: false, error: "완료 처리된 PO는 수정할 수 없습니다." }, { status: 400 });
}
```

---

## 6. 보안 체크리스트

- [x] 모든 loader/action에서 `requireGVUser` 호출
- [x] URL params `id`를 `z.string().uuid()`로 검증
- [x] 소프트 삭제된 PO 접근 시 404
- [x] amount 서버사이드 재계산
- [x] complete 상태 PO 수정 차단
- [x] responseHeaders 모든 redirect/data에 포함

---

## 7. Pencil 디자인 초안

- [ ] PO Detail - Desktop 화면 (saelim.pen 추가)
- [ ] PO Edit - 기존 PO Create 디자인 재활용

---

## 8. 구현 결과

### 생성된 파일
- `app/loaders/po.$id.server.ts` - 173줄
- `app/components/po/po-detail-info.tsx` - PO 상세 정보 카드 (2열)
- `app/components/po/po-detail-items.tsx` - 품목 내역 테이블 (Desktop + Mobile)
- `app/routes/_layout.po.$id.tsx` - PO 상세 페이지 (Toggle + Clone + Delete + Edit)
- `app/routes/_layout.po.$id.edit.tsx` - PO 수정 페이지 (POForm pre-fill)
- `app/components/po/po-form.tsx` - actionName prop 추가

### 완료 기준
- [x] `npm run typecheck` 에러 없음 (tsc -b 성공)
- [x] `npm run dev` 정상 동작 (302 redirect on /)
- [x] PO 상세 조회 동작
- [x] PO 수정 (완료 PO 차단)
- [x] PO 삭제 (소프트 삭제 + AlertDialog)
- [x] PO 복제 → edit 페이지로 redirect
- [x] 상태 토글 (Optimistic UI)
- [x] 모바일 반응형
- [x] Pencil 디자인 초안 (YBZXo - PO Detail frame in saelim.pen)
