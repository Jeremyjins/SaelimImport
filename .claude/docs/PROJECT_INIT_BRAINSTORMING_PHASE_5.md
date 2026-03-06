# Phase 5: Shipping Documents - Comprehensive Brainstorming

**Date:** 2026-03-06
**Status:** Brainstorming Complete
**Next Step:** Phase 5-A 구현 시작

---

## 1. Agent Team & File Ownership

| # | Role | File | Scope |
|---|------|------|-------|
| 1 | **Architect** | [architect-notes.md](brainstorm/phase5/architect-notes.md) | 구현 단계, 데이터 플로우, 문서번호, 스터핑 아키텍처, 라우팅 |
| 2 | **Frontend Dev** | [frontend-notes.md](brainstorm/phase5/frontend-notes.md) | 컴포넌트 설계, 폼 레이아웃, 스터핑 UI, CSV UX, 반응형 |
| 3 | **Backend Dev** | [backend-notes.md](brainstorm/phase5/backend-notes.md) | 로더/액션, Zod 스키마, CRUD, 중량 집계, 크로스모듈 |
| 4 | **Security Reviewer** | [security-notes.md](brainstorm/phase5/security-notes.md) | RLS 정책, 입력 검증, CSV 보안, 데이터 격리 |
| 5 | **Researcher** | [research-notes.md](brainstorm/phase5/research-notes.md) | CSV 파싱, 무역서류 표준, 중량 계산, UX 패턴, ETD/ETA |

**제외:** Tester (코드 없음), Perf-analyzer (시기상조), Code-reviewer (코드 없음)

---

## 2. Phase 5 Overview

Shipping Documents = CI (Commercial Invoice) + PL (Packing List) 쌍. PI 확정 후 GV가 생성하며, 실제 선적 정보(선박, 항차, ETD/ETA)와 컨테이너별 스터핑 리스트를 관리.

### PO/PI와의 핵심 차이점
1. **Dual 문서번호**: ci_no + pl_no (항상 쌍으로 생성)
2. **선적 전용 필드**: vessel, voyage, etd, eta, ship_date, gross_weight, net_weight, package_no
3. **자식 엔티티**: Stuffing Lists (1:N) - PO/PI에는 없는 새로운 패턴
4. **중량 집계**: 스터핑 롤 상세 → 선적서류 gross/net weight 합산
5. **크로스모듈**: PI→Shipping 참조, Shipping→Delivery 링크, 향후 Shipping→Order 동기화

---

## 3. Implementation Sub-phases

### Phase 5-A: 목록 + 작성

**신규 파일:**
| File | Description |
|------|-------------|
| `app/types/shipping.ts` | TypeScript 타입 정의 |
| `app/loaders/shipping.schema.ts` | Zod 스키마 |
| `app/loaders/shipping.server.ts` | 목록 loader + 폼 loader + 생성 action |
| `app/components/shipping/shipping-form.tsx` | 작성/수정 공용 폼 |
| `app/components/shipping/shipping-line-items.tsx` | 품목 편집기 |
| `app/routes/_layout.shipping.new.tsx` | 작성 페이지 |

**수정 파일:**
| File | Change |
|------|--------|
| `app/routes/_layout.shipping.tsx` | Placeholder → 목록 페이지 |
| `app/routes.ts` | shipping/new, shipping/:id, shipping/:id/edit 라우트 추가 |

### Phase 5-B: 상세 + 수정 + 크로스모듈

**신규 파일:**
| File | Description |
|------|-------------|
| `app/loaders/shipping.$id.server.ts` | 상세/수정 loader + 액션 (CRUD + content) |
| `app/components/shipping/shipping-detail-info.tsx` | 기본정보 + 거래조건 + 선적정보 카드 |
| `app/components/shipping/shipping-detail-items.tsx` | 품목 읽기전용 테이블 |
| `app/components/shipping/shipping-weight-summary.tsx` | 중량/포장 요약 카드 |
| `app/routes/_layout.shipping.$id.tsx` | 상세 페이지 |
| `app/routes/_layout.shipping.$id.edit.tsx` | 수정 페이지 |

**수정 파일:**
| File | Change |
|------|--------|
| `app/loaders/pi.$id.server.ts` | 연결 선적서류 조회 추가 |
| `app/routes/_layout.pi.$id.tsx` | "선적서류 작성" 드롭다운 + 연결 선적서류 카드 |

### Phase 5-C: 스터핑 리스트 + CSV 업로드

**신규 파일:**
| File | Description |
|------|-------------|
| `app/lib/csv-parser.ts` | PapaParse 기반 CSV 파싱 유틸리티 |
| `app/components/shipping/stuffing-section.tsx` | 스터핑 전체 섹션 (컨테이너 목록) |
| `app/components/shipping/stuffing-container-card.tsx` | Collapsible 컨테이너 카드 |
| `app/components/shipping/stuffing-container-form.tsx` | 컨테이너 추가/수정 Dialog |
| `app/components/shipping/stuffing-roll-table.tsx` | 롤 상세 테이블 |
| `app/components/shipping/stuffing-csv-upload.tsx` | CSV 업로드 Dialog |

**수정 파일:**
| File | Change |
|------|--------|
| `app/loaders/shipping.$id.server.ts` | 스터핑 CRUD 액션 + 중량 재계산 |
| `app/routes/_layout.shipping.$id.tsx` | StuffingSection 컴포넌트 추가 |

**패키지 설치:** `npm install papaparse @types/papaparse`
**shadcn/ui 추가:** `radio-group` (CSV append/replace 선택용)

---

## 4. Key Architectural Decisions

### 4.1 문서번호 전략: CI/PL 공유 시퀀스

```typescript
// generate_doc_number('CI', ci_date) 1회 호출 후 PL은 문자열 치환
const { data: ciNo } = await supabase.rpc("generate_doc_number", {
  doc_type: "CI", ref_date: ci_date
});
const plNo = ciNo!.replace("GVCI", "GVPL");
// GVCI2603-001 → GVPL2603-001
```

**근거:** CI와 PL은 항상 쌍. 동일 시퀀스번호로 세관 교차검증 용이. DB 함수 변경 불필요.

### 4.2 PI → Shipping 데이터 매핑

| PI Field | Shipping Field | Notes |
|----------|---------------|-------|
| supplier_id (GV) | shipper_id | 같은 org, FK명만 다름 |
| buyer_id (Saelim) | consignee_id | 같은 org, FK명만 다름 |
| currency | currency | 직접 복사 |
| payment_term | payment_term | 직접 복사 |
| delivery_term | delivery_term | 직접 복사 |
| loading_port | loading_port | 직접 복사 |
| discharge_port | discharge_port | 직접 복사 |
| details (line items) | details | 직접 복사 (동일 구조) |

**새 필드** (PI에 없음): ci_date, ship_date, vessel, voyage, etd, eta, gross/net weight, package_no

### 4.3 Shipping → Delivery 링크

```
생성 시: deliveries.shipping_doc_id = shipping.id (WHERE pi_id = shipping.pi_id)
삭제 시: deliveries.shipping_doc_id = null (unlink only, delivery 삭제 안함)
복제 시: 링크 안함 (pi_id = null로 초기화)
```

### 4.4 스터핑 리스트 아키텍처

- 1 stuffing_list row = 1 컨테이너
- roll_details JSONB 배열 (롤별 상세)
- 중량 집계: 스터핑 변경 후 → 애플리케이션 코드로 shipping doc 업데이트
- CSV: 클라이언트 파싱 (PapaParse) → JSON으로 서버 전송
- Clone 시 스터핑 리스트 복제 안함

### 4.5 CSV 파싱: PapaParse (클라이언트)

**Researcher 권장 + Architect 검증:**
- PapaParse: 순수 JS, 의존성 없음, ~46KB, RFC 4180 완전 준수
- 한국어 UTF-8 지원, quoted fields 안전 처리
- CF Workers/브라우저 모두 호환
- 대안(d3-dsv, 수동 파서)보다 안정성 우수

### 4.6 중량 집계 헬퍼

```typescript
async function recalcWeightsFromStuffing(supabase, shippingDocId: string) {
  const { data: stuffingLists } = await supabase
    .from("stuffing_lists")
    .select("roll_details")
    .eq("shipping_doc_id", shippingDocId);

  let netWeight = 0, grossWeight = 0, packageNo = 0;
  for (const sl of stuffingLists ?? []) {
    for (const roll of (sl.roll_details ?? [])) {
      netWeight += roll.net_weight_kg;
      grossWeight += roll.gross_weight_kg;
    }
    packageNo += (sl.roll_details ?? []).length;
  }

  await supabase.from("shipping_documents").update({
    net_weight: Math.round(netWeight * 100) / 100,
    gross_weight: Math.round(grossWeight * 100) / 100,
    package_no: packageNo,
  }).eq("id", shippingDocId);
}
```

---

## 5. Route Structure

```typescript
// app/routes.ts 추가
route("shipping/new", "routes/_layout.shipping.new.tsx"),
route("shipping/:id", "routes/_layout.shipping.$id.tsx"),
route("shipping/:id/edit", "routes/_layout.shipping.$id.edit.tsx"),
```

---

## 6. TypeScript Types Summary

```typescript
// app/types/shipping.ts
ShippingLineItem    // 품목 (PO/PI와 동일 구조)
ShippingWithOrgs    // 상세 (org join + PI ref + stuffing lists)
ShippingListItem    // 목록 (compact)
ShippingEditData    // 수정 폼 데이터
SourcePI            // PI 참조 생성용
StuffingList        // 스터핑 (id, cntr_no, seal_no, roll_details[])
StuffingRollDetail  // 롤 상세 (roll_no, product, gsm, width, length, net/gross weight)
```

---

## 7. Zod Schemas Summary

```typescript
// app/loaders/shipping.schema.ts
shippingSchema      // ci_date, ship_date, vessel, voyage, etd, eta, shipper/consignee_id, currency, terms, ports
lineItemSchema      // po.schema에서 재사용
stuffingListSchema  // sl_no, cntr_no, seal_no
stuffingRollSchema  // roll_no, product_name, gsm, width_mm, length_m, net/gross_weight_kg
```

---

## 8. UI Design Summary

### 목록 페이지
- 전체/진행/완료 탭, CI/PL번호 검색
- Desktop: CI/PL No(스택), CI Date, PI No, Shipper, Vessel, Amount, Status
- Mobile: 카드 (CI/PL No + Status, Vessel, Amount)

### 작성/수정 폼
- 4개 카드 그리드: 기본정보, 거래당사자, 거래조건, 선적정보
- 품목 편집기 (PI와 동일 패턴)
- 중량/포장은 폼에서 수동 입력 가능 (스터핑 자동계산은 상세에서)
- PI 참조 프리필 (`?from_pi=uuid`)

### 상세 페이지
- 3+α 카드: 기본정보, 거래조건, 선적정보, 중량/포장 요약
- 품목 읽기전용 테이블
- **스터핑 리스트 섹션** (Collapsible 컨테이너 카드)
  - 컨테이너 헤더: SL No, CNTR No, Seal No, 롤 수, 중량
  - 펼치면 롤 상세 테이블 (7열)
  - CRUD: Dialog 기반 편집, fetcher.submit
  - CSV 업로드: Dialog (파일선택 → 파싱 → 미리보기 → 확인)
- Content 섹션 (메모/첨부/댓글)
- 액션: 수정, 복제, 삭제, 상태 토글

### 모바일
- 기존 PO/PI와 동일 패턴 (세로 스택, 카드뷰)
- 롤 상세: 7열 테이블 → 모바일 카드 변환

---

## 9. Security Checklist (Critical Items)

### DB 사전 작업 (코드 작성 전)
- [ ] `stuffing_lists`에 `deleted_at`, `created_by` 컬럼 추가
- [ ] `stuffing_lists`에 RLS 활성화 + `gv_all` 정책 추가
- [ ] `shipping_documents`의 `saelim_read` RLS 정책 범위 확인 (pricing 노출 문제)
- [ ] `ci_no`, `pl_no` UNIQUE 제약조건 확인
- [ ] `generate_doc_number` RPC가 'CI' doc_type 지원 확인

### 애플리케이션 보안
- [ ] 모든 shipping 로더/액션에 `requireGVUser()` 사용
- [ ] URL param `$id` UUID 검증
- [ ] `responseHeaders` 모든 `data()`/`redirect()`에 전달
- [ ] 금액 서버사이드 재계산 (client amount 무시)
- [ ] `net_weight <= gross_weight` 크로스필드 검증
- [ ] `pi_id` 존재+활성 검증
- [ ] `shipper_id`, `consignee_id` 활성 org 검증
- [ ] Complete 상태에서 수정/삭제 차단

### CSV 업로드 보안
- [ ] 파일 크기 500KB 제한
- [ ] 행 수 500행 제한
- [ ] .csv 확장자 검증
- [ ] PDF/ZIP magic byte 거부
- [ ] 행별 Zod 검증
- [ ] 수식 인젝션 방지 (선행 `=+\-@` 제거)

---

## 10. Cross-Module Links

### PI Detail → Shipping
- PI 상세 드롭다운: "선적서류 작성" → `/shipping/new?from_pi={pi.id}`
- PI 상세 카드: "연결 선적서류" 목록 (ci_no, pl_no, ci_date, status, vessel)
- PI loader: `shipping_documents WHERE pi_id = :piId` 추가 조회

### Shipping Detail → PI
- 선적서류 상세: 참조 PI를 blue Link로 표시

### Shipping → Delivery
- 생성: `deliveries.shipping_doc_id` 업데이트 (pi_id 매칭)
- 삭제: `deliveries.shipping_doc_id = null` (unlink)

### Shipping → Order (Phase 6, 미구현)
- `orders.shipping_doc_id` FK 존재
- vessel, voyage, etd, eta 동기화는 Phase 6에서

---

## 11. Korean Labels Reference

| English | Korean |
|---------|--------|
| Shipping Documents | 선적서류 |
| Commercial Invoice | 상업송장 (CI) |
| Packing List | 포장명세서 (PL) |
| Stuffing List | 스터핑 리스트 |
| Shipper | 송하인 |
| Consignee | 수하인 |
| Vessel | 선박명 |
| Voyage | 항차 |
| ETD | 출항예정일 |
| ETA | 도착예정일 |
| Ship Date | 선적일 |
| Gross Weight | 총중량 |
| Net Weight | 순중량 |
| Package | 포장수 |
| Container No | 컨테이너 번호 |
| Seal No | 봉인 번호 |
| Roll No | 롤 번호 |

---

## 12. Edge Cases & Notes

1. **1 PI : N Shipping Docs** 허용 (부분 선적). Delivery의 shipping_doc_id는 마지막 생성 건이 덮어씀.
2. **중량 필드**: 생성 시 null → 스터핑 추가 후 자동 계산. 수동 입력도 가능하나 스터핑 집계가 우선.
3. **스터핑 없는 컨테이너**: 허용 (메타 정보만 먼저 입력 가능)
4. **Clone → 스터핑 미복제**: 각 선적은 고유한 컨테이너/롤 데이터
5. **스터핑 삭제**: Hard delete (stuffing_lists에 독립 생명주기 없음). Security 검토에서 deleted_at 추가 권장.
6. **ship_date vs ETD**: 다른 개념. ship_date=화물 적재일, ETD=선박 출항일.
7. **한국-대만 항로**: Keelung/Kaohsiung → Busan, 2-4일 항해.

---

## 13. Research Highlights

- **PapaParse** 권장 (CSV): ~46KB, RFC 4180 완전 준수, CF Workers 호환
- **ISO 6346** 컨테이너 번호: `ABCU1234567` (4자+7숫자), 선택적 검증
- **CI/PL 공유 번호**: 업계 표준 관행과 일치
- **종이 롤 Tare**: Net 대비 약 1-3% (40gsm 220kg 롤 → Gross ~224kg)
- **중량 소수점**: 2자리 (Math.round(x*100)/100)

---

## 14. Detailed Notes

각 팀원별 상세 분석은 아래 파일 참조:
- [Architect Notes](brainstorm/phase5/architect-notes.md) - 전체 아키텍처, 구현 순서, 타입 정의
- [Frontend Dev Notes](brainstorm/phase5/frontend-notes.md) - UI 컴포넌트, 레이아웃, 한국어 라벨
- [Backend Dev Notes](brainstorm/phase5/backend-notes.md) - 로더/액션 코드, Supabase 쿼리 패턴
- [Security Review Notes](brainstorm/phase5/security-notes.md) - RLS, 입력 검증, CSV 보안 체크리스트
- [Research Notes](brainstorm/phase5/research-notes.md) - CSV 파싱, 무역 표준, ETD/ETA
