# Phase 2 분석 기반 개선 구현 보고서

**Date:** 2026-03-06
**기반 분석:** `PROJECT_INIT_ANALYZE_PHASE_2.md`
**결과:** `npm run typecheck` 에러 없음 ✅

---

## 팀 구성 및 역할 분담

| 역할 | 담당 영역 | 투입 여부 |
|------|----------|-----------|
| **Architect (리더)** | 전체 변경 설계, 파일 의존성 관리, 순서 결정 | ✅ |
| **Backend Dev** | 서버 로직 수정 (C1/C2/V1/V2/V3/W4) | ✅ |
| **Frontend Dev** | 컴포넌트/라우트 수정 (W3/W5/I1/I4/I6) | ✅ |
| **Code Reviewer** | 타입 통일, 패턴 일관성 (W1/I4) | ✅ |
| **Security Reviewer** | V1/V2 검증 로직 확인 | ✅ |
| **Tester** | typecheck 실행으로 컴파일 오류 확인 | ✅ |
| Researcher | 불필요 (기존 코드베이스 내 분석 완료) | ❌ |
| Perf Analyzer | 불필요 (I6 단순 최적화로 직접 적용) | ❌ |

---

## 파일 소유권 (충돌 방지)

| Agent | 파일 |
|-------|------|
| Backend Dev | `app/loaders/po.schema.ts` (신규), `app/loaders/po.server.ts`, `app/loaders/po.$id.server.ts` |
| Frontend Dev | `app/components/po/po-line-items.tsx`, `app/routes/_layout.po.tsx`, `app/routes/_layout.po.$id.edit.tsx` |
| Code Reviewer | `app/types/po.ts`, `app/components/shared/doc-status-badge.tsx` |

---

## 구현 항목별 상세

### 🔴 Critical (C1, C2) — 즉시 수정

#### C1: Zod 스키마 중복 제거
- **생성:** `app/loaders/po.schema.ts` — `lineItemSchema`, `poSchema` 공유 정의
- **수정:** `po.server.ts`, `po.$id.server.ts` — 로컬 스키마 삭제, import 대체
- **추가:** `poSchema.po_date`에 날짜 형식 regex 검증 (`/^\d{4}-\d{2}-\d{2}$/`) — V3도 함께 해결
- **추가:** `poSchema.validity`에 조건부 regex (`!v || ISO_DATE.test(v)`)

#### C2: 상태 조회 에러 핸들링 누락
- **수정:** `po.$id.server.ts` update action
- `const { data: existing }` → `const { data: existing, error: statusError }`
- `statusError || !existing` 시 404 반환 추가 → DB 오류 시 수정 진행 차단

---

### 🟡 Security (V1, V2, V3)

#### V1: 비활성 org 참조 검증 (Medium)
- **수정:** `po.server.ts` createPOAction — schema 파싱 후 `Promise.all`로 supplier/buyer 존재+활성 검증
- **수정:** `po.$id.server.ts` update action — 동일 패턴 적용
- Supabase `{ count: "exact", head: true }` 패턴으로 추가 데이터 전송 없이 검증

#### V2: toggle_status 클라이언트 신뢰 제거 (Medium)
- **수정:** `po.$id.server.ts` toggle_status 분기
- `formData.get("current_status")` → DB에서 직접 `.select("status")` 조회
- 레이스 컨디션 방지, 의도치 않은 상태 전환 차단

#### V3: 날짜 형식 검증 (Low) — C1과 함께 해결
- `po.schema.ts`의 `poSchema`에 포함

---

### 🟢 Code Quality (W1, W3, W4, W5, I1, I4, I6)

#### W1: DocStatus 타입 통일
- **수정:** `app/types/po.ts` — 로컬 `"process" | "complete"` 리터럴 제거, `DocStatus` import from `~/types/common`, re-export
- **수정:** `app/components/shared/doc-status-badge.tsx` — 로컬 `type DocStatus` 제거, import from `~/types/common`
- `POWithOrgs.status`, `POListItem.status` → `DocStatus` 타입 참조

#### W3: key={index} → UUID 기반 키
- **수정:** `app/components/po/po-line-items.tsx`
- `LineItemRow = POLineItem & { _rowId: string }` 내부 타입 추가
- `emptyItem()` / `withRowId()` 헬퍼로 `crypto.randomUUID()` 부여
- `key={item._rowId}` 사용
- 직렬화 시 `_rowId` 제외: `items.map(({ _rowId: _, ...item }) => item)`
- 동적 추가/삭제 시 상태 오염 방지

#### W4: select("*") → 명시적 컬럼
- **수정:** `po.$id.server.ts` detail loader — 모든 컬럼 명시 (FK join 포함)
- **수정:** `po.$id.server.ts` edit loader — 편집에 필요한 컬럼만 명시
- **주의:** clone action은 `select("*")` + 타입 캐스팅 유지 (Supabase `GenericStringError` 우회, W4 분석 문서에도 미언급 항목)

#### W5: 테이블 행 키보드 접근성
- **수정:** `app/routes/_layout.po.tsx` TableRow에 `tabIndex={0}` + `onKeyDown` (Enter/Space → navigate) 추가

#### I1: 미사용 변수 currency 제거
- **수정:** `app/components/po/po-line-items.tsx` — `const currency = ""` 라인 제거

#### I4: EditLoaderData 로컬 중복
- **수정:** `app/types/po.ts` — `POEditData` 인터페이스 추가 (export)
- **수정:** `app/routes/_layout.po.$id.edit.tsx` — 로컬 `EditLoaderData` 삭제, `POEditData` import
- **개선:** Header title에 PO 번호 표시 (`"구매주문 수정 — ${po.po_no}"`) — 설계 문서 반영

#### I6: counts 계산 최적화
- **수정:** `app/routes/_layout.po.tsx`
- `import { useState, useMemo } from "react"` — useMemo 추가
- 3회 배열 순회 → `useMemo` + 단일 `for...of` reduce

---

## 미적용 항목 및 이유

| 항목 | 이유 |
|------|------|
| W2: `as unknown as` 캐스팅 근본 해결 | React Router 7 타입 추론 한계, 별도 연구 필요 (향후 개선) |
| W6: ActionResult 캐스팅 반복 | `(actionData as { error?: string } \| undefined)?.error` 패턴은 2곳뿐, 추상화 오버킬 |
| I2: `quantity_kg \|\| ""` 0 표시 문제 | Zod `positive()` 검증으로 저장값은 항상 > 0, UX적으로도 placeholder가 더 자연스러움 |
| I3: handleDelete isDeleting 피드백 | AlertDialog + fetcher.state로 버튼 disabled 처리됨, 큰 문제 없음 |
| I5: Promise.all 개별 에러 무시 | 폼용 데이터(suppliers/buyers/products) 부분 실패 시 빈 배열 표시가 허용 가능한 수준 |
| I7: getProductLabel/Spec 공통 유틸 | PI 모듈 구현 시 재사용 필요 시점에 추출 (현재 2곳만 존재) |
| V4: RLS 정책 수동 확인 | Supabase Dashboard에서 직접 확인 필요 (자동화 불가) |

---

## typecheck 결과

```
✅ 에러 없음 (0 errors)
```

---

## 변경 파일 목록

| 파일 | 변경 유형 | 주요 내용 |
|------|----------|----------|
| `app/loaders/po.schema.ts` | **신규** | 공유 Zod 스키마 + 날짜 regex |
| `app/loaders/po.server.ts` | 수정 | schema import, V1 org 검증 추가 |
| `app/loaders/po.$id.server.ts` | 수정 | schema import, C2/V1/V2/W4 fixes |
| `app/types/po.ts` | 수정 | DocStatus import, POEditData 추가 |
| `app/components/shared/doc-status-badge.tsx` | 수정 | DocStatus import from common |
| `app/components/po/po-line-items.tsx` | 수정 | UUID keys, 미사용 변수 제거 |
| `app/routes/_layout.po.tsx` | 수정 | useMemo counts, 키보드 접근성 |
| `app/routes/_layout.po.$id.edit.tsx` | 수정 | POEditData 사용, Header PO번호 표시 |
