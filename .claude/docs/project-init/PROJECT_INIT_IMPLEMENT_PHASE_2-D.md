# Phase 2-D 구현 계획: Polish

**Date:** 2026-03-06
**Status:** 완료
**참조:** [Phase 2 브레인스토밍](PROJECT_INIT_BRAINSTORMING_PHASE_2.md) | [Phase 2-C 구현](PROJECT_INIT_IMPLEMENT_PHASE_2-C.md)

---

## 1. 현황 분석

Phase 2-A/B/C 구현 후 완료된 항목:
- ✅ 검색 기능 (client-side, _layout.po.tsx)
- ✅ SPA 네비게이션 (useNavigate)
- ✅ formatDate / formatCurrency 공용 함수 사용
- ✅ 목록 Empty state
- ✅ POForm 제출 loading state (isSubmitting + Loader2)
- ✅ 목록 모바일 카드 뷰

미완 Polish 항목:
1. POForm 취소 버튼이 `/po` 하드코딩 → 수정 페이지에서 취소 시 `/po/:id`로 돌아가야 함
2. 상세 페이지 fetcher 에러 미표시 → toggle/clone/delete 실패 시 에러 미노출
3. 목록 페이지 loader 에러 미표시 → 데이터 로드 실패 시 에러 메시지 미노출

---

## 2. 에이전트 팀 구성

| 팀원 | 역할 | 담당 파일 |
|------|------|----------|
| **Frontend Dev** | 전체 구현 | `po-form.tsx`, `_layout.po.$id.tsx`, `_layout.po.tsx` |
| **Code Reviewer** | 코드 검토 (선택) | - |

**제외:** Architect (구조 변경 없음), Backend Dev (서버 코드 변경 없음), Security (신규 취약점 없음), Tester, Perf-analyzer

---

## 3. 파일 소유권 (File Ownership)

| # | 파일 | Owner | 설명 |
|---|------|-------|------|
| 1 | `app/components/po/po-form.tsx` | Frontend | `cancelTo` prop 추가 (default: "/po") |
| 2 | `app/routes/_layout.po.$id.tsx` | Frontend | fetcher 에러 표시 (인라인 alert) |
| 3 | `app/routes/_layout.po.tsx` | Frontend | loader 에러 표시 |

---

## 4. Task 목록

### T1: POForm `cancelTo` prop 추가
- [x] **파일:** `app/components/po/po-form.tsx`
- [x] `POFormProps`에 `cancelTo?: string` 추가 (default: `"/po"`)
- [x] 취소 버튼 `<Link to={cancelTo ?? "/po"}>` 로 변경
- [x] `_layout.po.$id.edit.tsx`에서 `cancelTo={/po/${po.id}}` 전달

### T2: Detail 페이지 fetcher 에러 표시
- [x] **파일:** `app/routes/_layout.po.$id.tsx`
- [x] `fetcher.data?.error` 감지 시 인라인 에러 배너 표시
- [x] toggle / clone / delete 실패 메시지를 페이지 상단에 표시

### T3: 목록 페이지 loader 에러 표시
- [x] **파일:** `app/routes/_layout.po.tsx`
- [x] loader가 `error` 필드 반환 시 페이지 상단에 에러 배너 표시

---

## 5. 구현 핵심 패턴

### 5.1 POForm cancelTo prop
```tsx
// po-form.tsx
interface POFormProps {
  // ...
  cancelTo?: string;
}
// 취소 버튼
<Link to={cancelTo ?? "/po"}>취소</Link>

// _layout.po.$id.edit.tsx
<POForm cancelTo={`/po/${po.id}`} ... />
```

### 5.2 Fetcher 에러 표시
```tsx
// _layout.po.$id.tsx
const fetcherError = (fetcher.data as { error?: string } | null)?.error;

{fetcherError && (
  <div className="mx-4 mt-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
    {fetcherError}
  </div>
)}
```

### 5.3 Loader 에러 표시
```tsx
// _layout.po.tsx
const { pos, error } = useLoaderData<typeof loader>() as { pos: POListItem[]; error?: string };

{error && (
  <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
    {error}
  </div>
)}
```

---

## 6. 보안 체크리스트

- [x] `cancelTo` prop은 내부 경로만 허용 (Link to는 앱 내 경로)
- [x] 에러 메시지는 서버에서 사전 정의된 메시지만 표시 (XSS 위험 없음)
- [x] 신규 서버 코드 없음 (보안 검토 불필요)

---

## 7. 구현 결과

### 구현된 파일
- [x] `app/components/po/po-form.tsx` - cancelTo prop
- [x] `app/routes/_layout.po.$id.tsx` - fetcher 에러 표시
- [x] `app/routes/_layout.po.tsx` - loader 에러 표시

### 완료 기준
- [x] 수정 페이지 취소 → `/po/:id` 로 이동
- [x] toggle/clone/delete 실패 시 에러 메시지 표시
- [x] 목록 로드 실패 시 에러 메시지 표시
- [x] `npm run typecheck` 에러 없음
