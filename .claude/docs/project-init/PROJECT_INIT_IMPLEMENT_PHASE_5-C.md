# Phase 5-C Implementation Plan: Stuffing List + CSV Upload

**Date:** 2026-03-06
**Status:** 구현 완료 (2026-03-06)
**Scope:** 스터핑 리스트 CRUD + CSV 업로드 + 중량 자동 재계산

---

## Agent Team

| # | Role | Scope |
|---|------|-------|
| 1 | **Architect** | 데이터 플로우, 파일 소유권 |
| 2 | **Backend Dev** | shipping.$id.server.ts CRUD 추가, types/schema 업데이트 |
| 3 | **Frontend Dev** | 5개 컴포넌트 + 상세 페이지 업데이트 |
| 4 | **Security Reviewer** | CSV 보안 검증, RLS 확인 |

---

## File Ownership

| Agent | Files |
|-------|-------|
| Backend Dev | `app/types/shipping.ts`, `app/loaders/shipping.schema.ts`, `app/loaders/shipping.$id.server.ts` |
| Frontend Dev | `app/components/shipping/stuffing-section.tsx`, `app/components/shipping/stuffing-container-card.tsx`, `app/components/shipping/stuffing-container-form.tsx`, `app/components/shipping/stuffing-roll-table.tsx`, `app/components/shipping/stuffing-csv-upload.tsx`, `app/routes/_layout.shipping.$id.tsx` |

---

## Task List

| # | Task | File | Status |
|---|------|------|--------|
| C-0 | 패키지 설치: papaparse + @types/papaparse | npm | ✅ 완료 |
| C-0b | shadcn/ui radio-group 설치 | shadcn | ✅ 완료 |
| C-1 | 타입 추가: StuffingList, StuffingRollDetail, ShippingWithOrgs 업데이트 | `app/types/shipping.ts` | ✅ 완료 |
| C-2 | Zod 스키마 추가: stuffingListSchema, stuffingRollSchema | `app/loaders/shipping.schema.ts` | ✅ 완료 |
| C-3 | 상세 loader: stuffing_lists 조회 추가 | `app/loaders/shipping.$id.server.ts` | ✅ 완료 |
| C-4 | 스터핑 CRUD 액션 추가 (create/update/delete/csv) | `app/loaders/shipping.$id.server.ts` | ✅ 완료 |
| C-5 | 롤 상세 테이블 컴포넌트 | `app/components/shipping/stuffing-roll-table.tsx` | ✅ 완료 |
| C-6 | 컨테이너 폼 Dialog | `app/components/shipping/stuffing-container-form.tsx` | ✅ 완료 |
| C-7 | CSV 업로드 Dialog | `app/components/shipping/stuffing-csv-upload.tsx` | ✅ 완료 |
| C-8 | 컨테이너 카드 (Collapsible) | `app/components/shipping/stuffing-container-card.tsx` | ✅ 완료 |
| C-9 | 스터핑 섹션 | `app/components/shipping/stuffing-section.tsx` | ✅ 완료 |
| C-10 | 상세 페이지 StuffingSection 통합 | `app/routes/_layout.shipping.$id.tsx` | ✅ 완료 |

---

## Implementation Details

### C-1: 타입 업데이트 (`app/types/shipping.ts`)
- `StuffingRollDetail` 인터페이스 추가 (roll_no, product_name, gsm, width_mm, length_m, net/gross_weight_kg)
- `StuffingList` 인터페이스 추가 (id, shipping_doc_id, sl_no, cntr_no, seal_no, roll_no_range, roll_details[])
- `ShippingWithOrgs.stuffing_lists` 필드 추가

### C-2: Zod 스키마 추가 (`app/loaders/shipping.schema.ts`)
- `stuffingListSchema`: sl_no, cntr_no, seal_no 검증
- `stuffingRollSchema`: roll_no(int), product_name, gsm, width_mm, length_m, net/gross_weight_kg 검증
- CSV 보안: 수식 인젝션 방지 선행 문자(=+\-@) 제거

### C-3/C-4: 서버 업데이트 (`app/loaders/shipping.$id.server.ts`)
- detail loader에 stuffing_lists 병렬 조회 추가
- `stuffing_create` 액션: sl_no 자동 채번, roll_details JSONB 저장, recalcWeights 호출
- `stuffing_update` 액션: 존재 확인, roll_details 업데이트, recalcWeights 호출
- `stuffing_delete` 액션: hard delete (독립 생명주기 없음), recalcWeights 호출
- `stuffing_csv` 액션: JSON roll_details 수신 (클라이언트에서 파싱), append/replace 처리
- `recalcWeightsFromStuffing()` 헬퍼: 중량/포장수 집계 → shipping_documents 업데이트

### C-5~C-9: 컴포넌트 구조
- **StuffingRollTable**: Desktop 7열 테이블 + Mobile 카드, 합계 행 포함
- **StuffingContainerForm**: Dialog, sl_no/cntr_no/seal_no + 롤 인라인 편집 테이블
- **StuffingCSVUpload**: Dialog, 2단계 (파일선택→미리보기), PapaParse 클라이언트 파싱, append/replace 라디오
- **StuffingContainerCard**: Collapsible, 헤더 요약(롤수+중량), 하단 수정/삭제 버튼
- **StuffingSection**: Card 래퍼, 헤더(CSV업로드+컨테이너추가), 컨테이너 목록, 전체 합계

### C-10: 상세 페이지 통합 (`app/routes/_layout.shipping.$id.tsx`)
- ShippingSection 컴포넌트 import + 중량/포장 요약 위에 삽입
- `stuffing_*` intent toast 처리 추가

---

## Key Architectural Decisions

1. **중량 집계**: 스터핑 CRUD 후 `recalcWeightsFromStuffing()` 호출 → shipping_documents 업데이트
2. **CSV 파싱**: 클라이언트(PapaParse) → JSON 직렬화 → 서버 Zod 검증
3. **sl_no 자동채번**: `SL-001`, `SL-002` 형식 (기존 수 + 1)
4. **Stuffing delete**: hard delete (soft delete 없음, 독립 생명주기 불필요)
5. **Radio group**: append(추가)/replace(교체) 모드 CSV Dialog 내

---

## Security Notes

- CSV 파일 크기 500KB 제한 (클라이언트)
- CSV 행 500행 제한 (클라이언트)
- .csv 확장자 검증 (클라이언트)
- 행별 Zod 검증 (클라이언트 + 서버)
- 수식 인젝션 방지: 선행 `=+\-@` 문자 제거
- shipping_doc_id 소유권 검증 (서버에서 shipping 문서 존재 확인)
