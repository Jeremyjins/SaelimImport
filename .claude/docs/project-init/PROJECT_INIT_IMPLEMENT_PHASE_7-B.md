# Phase 7-B 구현계획: Customs Detail + Edit + Delete + Sync

**Date:** 2026-03-06
**Status:** 구현 완료

---

## 팀 구성 (보수적 선택)

| 역할 | 담당 범위 |
|------|-----------|
| **Architect (Lead)** | 전체 구현 설계, 파일 소유권, 아키텍처 결정 |
| **Backend Dev** | `customs.$id.server.ts` loader + action |
| **Frontend Dev** | `customs-detail-info.tsx`, `customs-fee-summary.tsx`, 라우트 페이지 |

**제외:** Tester, Perf-analyzer (Phase 7-C에서), Code-reviewer (구현 후), Security-reviewer (7-A에서 이미 RLS 확인완료)

---

## 파일 소유권 (충돌방지)

| 파일 | 담당 | 상태 |
|------|------|------|
| `app/loaders/customs.$id.server.ts` | Backend Dev | ✅ 완료 |
| `app/components/customs/customs-detail-info.tsx` | Frontend Dev | ✅ 완료 |
| `app/components/customs/customs-fee-summary.tsx` | Frontend Dev | ✅ 완료 |
| `app/routes/_layout.customs.$id.tsx` | Frontend Dev | ✅ 완료 |
| `app/routes/_layout.customs.$id.edit.tsx` | Frontend Dev | ✅ 완료 |
| `app/components/customs/customs-form.tsx` | Frontend Dev | ✅ 완료 (isEditing → _action 동적화) |

---

## Task 목록

### T1: `customs.$id.server.ts` 생성 ✅
- Detail loader: customs + shipping detail + content 병렬 조회
- customsEditLoader: 수정 폼 프리필용 lighter loader
- action: update, toggle_fee_received, delete, content_* 위임

### T2: `customs-detail-info.tsx` 생성 ✅
- 기본정보 카드 (customs_no, customs_date, 선적서류 링크, fee_received 토글)

### T3: `customs-fee-summary.tsx` 생성 ✅
- 비용 요약 카드 (grid-cols-2 md:grid-cols-4)
- 각 비용: 공급가액 / 부가세 / 합계
- 하단: 총 비용 합계 바

### T4: `_layout.customs.$id.tsx` 구현 ✅
- Header: 통관번호 + fee_received 배지 + 드롭다운(수정/삭제)
- 4개 섹션: 기본정보 / 비용요약 / Content / 메타
- Toast 피드백 (useEffect + prevStateRef)
- Delete AlertDialog

### T5: `_layout.customs.$id.edit.tsx` 구현 ✅
- customsEditLoader + action 재사용
- CustomsForm isEditing=true

### T6: `customs-form.tsx` 수정 ✅
- `_action` hidden input: isEditing ? "update" : "create"

---

## 아키텍처 결정

- **통합 update action**: 기본정보 + 비용 4종을 하나의 `update` intent로 처리 (customsUpdateSchema 재사용)
- **fee_received 토글**: 서버에서 DB 현재값 읽어 반전 → syncCustomsFeeToOrder 호출
- **delete**: unlinkCustomsFromOrder 먼저 → soft delete → redirect /customs
- **Content**: type="customs" (handleContentAction 위임)
- **edit 페이지 loader**: customsEditLoader (availableShippings 불필요 → 빈 배열 전달)
