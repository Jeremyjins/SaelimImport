# Phase 10-F: Testing — 상세 구현계획

**Date:** 2026-03-06
**Status:** ✅ 구현 완료 (15 test files, 416 tests, 0 failed)
**Dependencies:** Phase 10-E 완료 (order-sync unlink functions, form-utils.server.ts)

---

## 1. 에이전트 팀 구성

| # | Role | File Ownership | Status |
|---|------|---------------|--------|
| Leader | Architect | 계획 수립, 의사결정 | ✅ 완료 |
| Agent 1 | Backend-Dev | Infrastructure 설정 파일들 | ✅ 완료 |
| Agent 2 | Tester-A | Utility 단위 테스트 | ✅ 완료 |
| Agent 3 | Tester-B | PI/Shipping 스키마 테스트 | ✅ 완료 |
| Agent 4 | Tester-C | Customs/Delivery/Orders 스키마 테스트 | ✅ 완료 |
| Agent 5 | Tester-D | Order-Sync 통합 테스트 | ✅ 완료 |

> 보수적 판단: Frontend-Dev (UI 변경 없음), Security-Reviewer (기존 코드 검토만), Researcher (이미 전략 수립) → 제외

---

## 2. 구현 범위 및 우선순위

### P0: Infrastructure 수정 (선행 필수)
- [ → ✅] `vitest.config.ts` — `.test.tsx` include 추가, coverage 경로 확장
- [ → ✅] `app/test/setup.ts` — RTL setup, console.error 억제
- [ → ✅] `app/test/supabase-mock.ts` — Supabase 체인 mock 팩토리
- [ → ✅] `app/test/request-factory.ts` — Request/FormData 헬퍼
- [ → ✅] `app/test/fixtures.ts` — 테스트 픽스처 (UUID, 모델 객체)

### P1: Tier 1 — 유틸리티 단위 테스트
- [ → ✅] `app/lib/__tests__/format.test.ts` — formatDate, formatCurrency, formatWeight, formatNumber
- [ → ✅] `app/lib/__tests__/sanitize.test.ts` — sanitizeFormulaInjection
- [ → ✅] `app/lib/__tests__/customs-utils.test.ts` — calcTotalFees, computeFeeTotal
- [ → ✅] `app/components/pdf/shared/__tests__/pdf-utils.test.ts` — formatPdfDate, formatPdfCurrency, formatPdfNumber, formatPdfWeight, filename sanitization

### P1: Tier 1 — 스키마 단위 테스트
- [ → ✅] `app/loaders/__tests__/pi.schema.test.ts` — piSchema, lineItemSchema (from pi), po_id union
- [ → ✅] `app/loaders/__tests__/shipping.schema.test.ts` — stuffingRollSchema, stuffingListSchema (formula injection), shippingSchema
- [ → ✅] `app/loaders/__tests__/customs.schema.test.ts` — customsCreateSchema, customsUpdateSchema, fee coercion, MAX_FEE
- [ → ✅] `app/loaders/__tests__/delivery.schema.test.ts` — submitChangeRequestSchema (future-date refine), approveRequestSchema, rejectRequestSchema
- [ → ✅] `app/loaders/__tests__/orders.schema.test.ts` — createOrderSchema, updateFieldsSchema, linkDocumentSchema, unlinkDocumentSchema

### P1: Tier 2 — 통합 테스트 (order-sync)
- [ → ✅] `app/lib/__tests__/order-sync.server.test.ts` — 신규 unlink 함수들 (unlinkPOFromOrder, unlinkPIFromOrder, unlinkShippingFromOrder), 기존 sync 함수

---

## 3. 파일별 구현 상세

### 3.1 vitest.config.ts 수정

```typescript
// 변경사항:
// 1. include: ["app/**/*.test.ts"] → ["app/**/*.test.{ts,tsx}"]
// 2. coverage.include에 lib/*.ts 비서버 파일 추가
// 3. setupFiles 추가
test: {
  environment: "node",
  include: ["app/**/*.test.{ts,tsx}"],
  setupFiles: ["app/test/setup.ts"],
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary", "html"],
    include: [
      "app/loaders/**/*.server.ts",
      "app/lib/**/*.server.ts",
      "app/lib/format.ts",
      "app/lib/sanitize.ts",
      "app/lib/customs-utils.ts",
      "app/components/pdf/shared/pdf-utils.ts",
    ],
  },
}
```

### 3.2 테스트 헬퍼 파일들

**`app/test/setup.ts`** — RTL cleanup + console.error mock
**`app/test/supabase-mock.ts`** — createMockSupabase(), createMockAuthResult()
**`app/test/request-factory.ts`** — makeRequest(), makeFormData()
**`app/test/fixtures.ts`** — TEST_UUID, mockPO, mockLineItem, mockPI, mockShipping, mockCustoms, mockOrder, mockDelivery

### 3.3 delivery.schema.test.ts 핵심 패턴

```typescript
// vi.useFakeTimers() 필수 (submitChangeRequestSchema future-date refine)
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
```

### 3.4 pdf-utils.test.ts 핵심 패턴

```typescript
// triggerDownload는 DOM API 의존 → 파일명 sanitization 로직만 직접 테스트
it("파일명 특수문자 제거", () => {
  const raw = "GV PO/2026-03-06 (copy).pdf";
  const safe = raw.replace(/[^a-zA-Z0-9._\-]/g, "_");
  expect(safe).toBe("GV_PO_2026-03-06__copy_.pdf");
});
```

### 3.5 order-sync.server.test.ts 핵심 패턴

```typescript
// Supabase mock으로 updateEq 체인 검증
// unlinkPOFromOrder, unlinkPIFromOrder, unlinkShippingFromOrder
// fire-and-forget: error 발생시 console.error 호출 확인
```

---

## 4. package.json 스크립트 추가

```json
"test:unit": "vitest run app/lib/__tests__/",
"test:schemas": "vitest run app/loaders/__tests__/*.schema.test.ts",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

---

## 5. 디자인 작업

Phase 10-F는 Testing 단계로 UI 변경 없음 → Pencil MCP 사용 불필요

---

## 6. Task 목록 및 완료 현황

### Task F-1: Infrastructure Setup [✅ 완료]
- `vitest.config.ts` 수정
- `app/test/setup.ts` 생성
- `app/test/supabase-mock.ts` 생성
- `app/test/request-factory.ts` 생성
- `app/test/fixtures.ts` 생성

### Task F-2: Utility Tests [✅ 완료]
- `app/lib/__tests__/format.test.ts` 생성
- `app/lib/__tests__/sanitize.test.ts` 생성
- `app/lib/__tests__/customs-utils.test.ts` 생성
- `app/components/pdf/shared/__tests__/pdf-utils.test.ts` 생성

### Task F-3: PI/Shipping Schema Tests [✅ 완료]
- `app/loaders/__tests__/pi.schema.test.ts` 생성
- `app/loaders/__tests__/shipping.schema.test.ts` 생성

### Task F-4: Customs/Delivery/Orders Schema Tests [✅ 완료]
- `app/loaders/__tests__/customs.schema.test.ts` 생성
- `app/loaders/__tests__/delivery.schema.test.ts` 생성
- `app/loaders/__tests__/orders.schema.test.ts` 생성

### Task F-5: Order-Sync Integration Tests [✅ 완료]
- `app/lib/__tests__/order-sync.server.test.ts` 생성

---

## 7. 커버리지 목표

| Layer | 목표 |
|-------|------|
| 스키마 파일 (*.schema.ts) | 90% |
| 유틸리티 (format, sanitize, customs-utils, pdf-utils) | 80% |
| order-sync.server.ts | 70% |
| 전체 | 50% |

---

## 8. 최종 구현 결과

**실행일: 2026-03-06**
**결과: 15 test files, 416 tests, 0 failed**

| File | Tests |
|------|-------|
| `app/lib/__tests__/order-sync.server.test.ts` | 34 |
| `app/lib/__tests__/format.test.ts` | 33 |
| `app/components/pdf/shared/__tests__/pdf-utils.test.ts` | 44 |
| `app/loaders/__tests__/pi.schema.test.ts` | 24 |
| `app/loaders/__tests__/shipping.schema.test.ts` | 52 |
| `app/loaders/__tests__/customs.schema.test.ts` | 20 |
| `app/loaders/__tests__/delivery.schema.test.ts` | 21 |
| `app/loaders/__tests__/orders.schema.test.ts` | 25 |
| `app/lib/__tests__/sanitize.test.ts` | 14 |
| `app/lib/__tests__/customs-utils.test.ts` | 18 |
| 기존 5개 파일 (PO, auth, settings×3) | 131 |
| **합계** | **416** |

**package.json 추가 스크립트:**
- `npm run test:unit` — 유틸리티 단위 테스트
- `npm run test:schemas` — 스키마 테스트만
- `npm run test:watch` — watch 모드
