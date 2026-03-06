# Best Practice 기반 개선 아이디어

**Date:** 2026-03-06
**Purpose:** 초기 요구사항 대비 best practice 조사 결과 및 개선 제안

---

## 1. Architecture & Workflow Improvements

### 1.1 Document Status Machine 개선
**현재:** `진행 | 완료` 2개 상태
**개선안:** 상태를 좀 더 세분화하여 워크플로우 추적 강화

```
PO: draft → confirmed → shipped → completed
PI: draft → confirmed → shipped → completed
Shipping: draft → loaded → in_transit → arrived → completed
Customs: pending → in_progress → cleared → completed
Order: pending → in_progress → delivered → completed
```

**장점:**
- 현재 어느 단계에 있는지 한눈에 파악
- 대시보드에서 단계별 현황 시각화 가능
- 이후 자동화 트리거 연결 가능 (상태 변경 시 알림 등)

**고려사항:** 초기에는 2개 상태로 시작하되, DB 설계는 확장 가능하게 TEXT 타입으로 유지

### 1.2 Dashboard 추가 (Phase 0.5)
**현재:** 대시보드 없음
**개선안:** 홈 화면에 운영 현황 대시보드

```
┌──────────────┬──────────────┬──────────────┐
│ 진행중 PO: 5 │ 진행중 PI: 3 │ 선적중: 2    │
├──────────────┼──────────────┼──────────────┤
│ 통관대기: 1  │ 배송예정: 2  │ CY초과: 0    │
└──────────────┴──────────────┴──────────────┘

[최근 활동]
- GVPO2603-012 생성됨 (2시간 전)
- GVPI2603-008 상태 변경: 완료 (어제)

[CY 체류일 경고]
- GVCI2602-003: CY 12일 (2일 남음!)

[배송변경 요청]
- 세림 요청 #3: 2026-03-15 → 2026-03-20 (대기중)
```

### 1.3 Audit Trail / Activity Log
**현재:** 변경 이력 추적 없음
**개선안:** 주요 문서 변경 시 자동 로그

```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'po', 'pi', 'shipping', etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,       -- 'create', 'update', 'status_change', 'delete'
  changes JSONB,              -- {field: {old: x, new: y}}
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**장점:** 누가 언제 무엇을 변경했는지 추적 가능 → B2B 거래에서 분쟁 시 근거 자료

---

## 2. Data Model Improvements

### 2.1 Exchange Rate 관리
**현재:** currency만 텍스트로 저장
**개선안:** 환율 정보 저장 및 KRW 변환 지원

```sql
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_from TEXT NOT NULL DEFAULT 'USD',
  currency_to TEXT NOT NULL DEFAULT 'KRW',
  rate DECIMAL(12,4) NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**활용:**
- PO/PI 금액의 원화 환산 표시
- 통관 시 관세 계산 기준 환율 기록
- 월별 환율 추이 확인

### 2.2 Document Template/Preset
**현재:** 매번 수동 입력 또는 복제
**개선안:** 자주 사용하는 값을 preset으로 저장

```sql
CREATE TABLE document_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,              -- '기본 PO 템플릿'
  doc_type TEXT NOT NULL,          -- 'po', 'pi', 'shipping'
  template_data JSONB NOT NULL,    -- 사전설정 값들
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**장점:** payment_term, delivery_term, loading_port 등 반복 입력 감소

### 2.3 Notification System
**현재:** 알림 없음
**개선안:** In-app 알림 시스템

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL,        -- 'delivery_change_request', 'cy_warning', 'status_change'
  title TEXT NOT NULL,
  message TEXT,
  entity_type TEXT,
  entity_id UUID,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**트리거 시나리오:**
- 세림이 배송변경 요청 → GV 담당자에게 알림
- CY 체류일 12일 초과 → 경고 알림
- 문서 상태 변경 → 관련자에게 알림

---

## 3. Security Improvements

### 3.1 app_metadata 사용 (user_metadata 대신)
**현재 계획:** `user_metadata`에 org_id/org_type 저장
**개선안:** `app_metadata` 사용

**이유:** `user_metadata`는 사용자가 직접 수정 가능 (Supabase Auth API). `app_metadata`는 서버 사이드에서만 수정 가능하여 보안적으로 안전.

```sql
-- RLS에서 참조
CREATE OR REPLACE FUNCTION get_user_org_type()
RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type')::TEXT;
$$ LANGUAGE sql SECURITY DEFINER;
```

### 3.2 Column-Level Security for Saelim
**현재 계획:** RLS만으로 행 단위 제어
**개선안:** 민감 컬럼 보호를 위한 DB View

```sql
-- Saelim용 배송 정보 view (금액 정보 제외)
CREATE VIEW delivery_summary AS
SELECT
  d.id, d.delivery_date,
  pi.pi_no,
  sd.vessel, sd.voyage, sd.etd, sd.eta, sd.package_no,
  -- amount, unit_price 등 제외
  p.name as product_name, p.gsm, p.width_mm
FROM deliveries d
JOIN proforma_invoices pi ON d.pi_id = pi.id
LEFT JOIN shipping_documents sd ON d.shipping_doc_id = sd.id
LEFT JOIN LATERAL jsonb_array_elements(pi.details) det ON true
LEFT JOIN products p ON (det->>'product_id')::uuid = p.id;
```

### 3.3 Rate Limiting
**개선안:** Cloudflare Workers에서 rate limiting 설정
- Login: 5 attempts / 15 minutes
- API: 100 requests / minute per user
- File upload: 10 / minute

---

## 4. Frontend/UX Improvements

### 4.1 Optimistic UI Updates
**현재 계획:** Standard form submit → reload
**개선안:** useFetcher + optimistic updates

```
Status toggle: 즉시 UI 변경 → 백그라운드 서버 업데이트
Comment 추가: 즉시 목록에 표시 → 실패 시 롤백
```

### 4.2 Keyboard Shortcuts
**개선안:** 파워 유저를 위한 키보드 단축키
- `Ctrl+N`: 새 문서 생성
- `Ctrl+S`: 저장
- `Ctrl+P`: PDF 생성
- `/`: 검색 포커스

### 4.3 Global Search
**현재:** 모듈별 목록 필터만 있음
**개선안:** 전역 검색 (Cmd+K)
- PO/PI/Shipping 번호로 검색
- 제품명, 세림번호 등으로 검색
- Supabase full-text search 또는 ILIKE 활용

### 4.4 Bulk Actions
**개선안:** 목록에서 여러 문서 선택 후 일괄 처리
- 일괄 상태 변경
- 일괄 PDF 생성 (zip 다운로드)

### 4.5 TanStack Query vs React Router Only
**개선안:** Phase 1-3에서는 React Router loaders/actions + useFetcher만 사용

**이유:**
- React Router 7의 revalidation이 이미 TanStack Query의 주요 기능 대체
- `useFetcher`로 네비게이션 없는 mutation 가능
- 복잡성 감소, 의존성 감소
- Phase 6+ 에서 cross-module 실시간 업데이트가 필요하면 그때 TanStack Query 도입 검토

---

## 5. PDF Generation Improvements

### 5.1 단계적 PDF 접근법
**현재 계획:** @react-pdf/renderer 한가지 방법
**개선안:** 3단계 접근

**Step 1 (Phase 2-5):** Browser Print 방식
```
/po/:id/print → styled HTML page → Ctrl+P
- 구현 비용 최소
- 한국어 폰트 문제 없음 (시스템 폰트 사용)
- 레이아웃 확인 및 피드백 수집
```

**Step 2 (Phase 9):** @react-pdf/renderer
```
- 한국어 폰트 subset (Pretendard 또는 Noto Sans KR)
- 공식 문서 스타일 PDF 생성
- Step 1에서 확인한 레이아웃 반영
```

**Step 3 (필요 시):** Supabase Edge Function
```
- 서버사이드 PDF 생성
- 대량 PDF 일괄 생성 시 활용
```

### 5.2 Korean Font 전략 상세
**react-pdf에서 한국어 폰트 이슈 존재** (GitHub Issue #806, #933)
- CJK 폰트가 제대로 작동하지 않는 사례 보고됨
- **대안:** Pretendard 폰트 (한국어 최적화, Apache 2.0 라이선스)
- Subset 생성: `pyftsubset`으로 KS X 1001 기본 한글 + 영문 + 숫자
- 예상 크기: ~500KB (woff2)
- CDN 호스팅 (Cloudflare R2) + 브라우저 캐싱

---

## 6. Tiptap Editor Improvements

### 6.1 Image Upload Best Practice
**개선안:** Base64 저장 절대 금지, URL만 저장

```
1. allowBase64: false (절대 true로 설정하지 않기)
2. Image D&D → Supabase Storage 업로드 → URL 반환 → 에디터에 삽입
3. 이미지 리사이즈 지원 (resize option)
4. 최대 파일 크기: 5MB
5. 허용 타입: image/png, image/jpeg, image/gif, image/webp
6. SSR 환경에서 immediatelyRender: false 설정 필수
```

### 6.2 Editor 저장 전략
**개선안:** Auto-save + Manual save

```
- Auto-save: 30초마다 또는 blur 시 draft 저장
- Manual save: 저장 버튼 클릭 시 확정 저장
- Unsaved changes 경고 (페이지 이탈 시)
```

---

## 7. Supabase RLS Best Practice 적용

### 7.1 RLS Index 필수
**모든 RLS 정책에서 참조하는 컬럼에 인덱스 생성**

```sql
-- 필수 인덱스
CREATE INDEX idx_user_profiles_org_id ON user_profiles(org_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_proforma_invoices_status ON proforma_invoices(status);
CREATE INDEX idx_proforma_invoices_po_id ON proforma_invoices(po_id);
CREATE INDEX idx_shipping_documents_pi_id ON shipping_documents(pi_id);
CREATE INDEX idx_shipping_documents_status ON shipping_documents(status);
CREATE INDEX idx_customs_shipping_doc_id ON customs(shipping_doc_id);
CREATE INDEX idx_deliveries_pi_id ON deliveries(pi_id);
CREATE INDEX idx_contents_type_parent ON contents(type, parent_id);
CREATE INDEX idx_comments_content_id ON comments(content_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
```

### 7.2 RLS Policy 단순화
**Best practice:** 복잡한 JOIN이 있는 RLS는 성능 저하 → 단순한 정책 유지

```sql
-- Good: 단순한 정책
CREATE POLICY "gv_access" ON purchase_orders
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'org_type') = 'gv'
  );

-- Bad: 복잡한 JOIN이 있는 정책
CREATE POLICY "complex" ON some_table
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organizations o
      JOIN user_profiles up ON up.org_id = o.id
      WHERE up.id = auth.uid() AND o.type = 'seller'
    )
  );
```

### 7.3 RLS 테스트 방법
- SQL Editor는 RLS를 우회하므로 테스트에 부적합
- Supabase Client SDK로 테스트
- 테스트 사용자 생성 (GV, Saelim 각각)
- EXPLAIN ANALYZE로 성능 확인 (50ms 이하 목표)

---

## 8. React Router 7 CRUD Pattern 개선

### 8.1 Fetcher 활용 극대화
**개선안:** 네비게이션 없는 mutation에 useFetcher 활용

```
- Status toggle: fetcher.submit() → 페이지 리로드 없이 상태 변경
- Comment 추가: fetcher.Form → 목록에 즉시 반영
- 삭제: fetcher.submit() + 확인 다이얼로그
```

### 8.2 Server-Side Loader 패턴 정리
**개선안:** loader에서 권한 체크 + 데이터 로딩 패턴 표준화

```typescript
// 표준 loader 패턴
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  // 1. Auth check
  const user = await requireAuth(request, context);

  // 2. Org check (GV only routes)
  requireGVUser(user);

  // 3. Data fetch
  const supabase = createServerSupabase(request, context);
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Response('Failed to load', { status: 500 });

  return { items: data, user };
}
```

### 8.3 Error Boundary 전략
**개선안:** 모듈별 Error Boundary

```
- Route-level ErrorBoundary: 각 route에서 에러 처리
- 404: 문서를 찾을 수 없음
- 403: 접근 권한 없음 (Saelim → GV-only route 접근 시)
- 500: 서버 에러
```

---

## 9. 비즈니스 프로세스 개선 아이디어

### 9.1 자동 알림/리마인더
- ETA 3일 전 자동 알림
- CY 체류일 10일 도달 시 경고
- 배송변경 요청 24시간 미응답 시 리마인더

### 9.2 통계/리포트
- 월별 수입 금액 요약
- 제품별 수입 실적
- 통관비 월별 추이
- 배송변경 요청 빈도 분석

### 9.3 CSV/Excel Export
- 모든 목록 페이지에서 CSV export 기능
- 오더 관리 목록 Excel export (세림 공유용)

### 9.4 문서 번호 연결 표시 개선
**현재:** link_pi, link_po 등 단방향 연결
**개선안:** 문서 상세 페이지에서 전체 연결 체인 시각화

```
PO: GVPO2603-001
  └─ PI: GVPI2603-001
       ├─ Shipping: GVCI2603-001
       │    └─ Stuffing: SL-001
       ├─ Customs: CUS-2603-001
       ├─ Delivery: DEL-001
       └─ Order: ORD-001
```

### 9.5 Soft Delete
**현재:** 삭제 시 실제 삭제
**개선안:** soft delete (is_deleted flag)

```sql
-- 모든 문서 테이블에 추가
ALTER TABLE purchase_orders ADD COLUMN deleted_at TIMESTAMPTZ;

-- RLS에서 자동 필터
CREATE POLICY "hide_deleted" ON purchase_orders
  FOR SELECT USING (deleted_at IS NULL);
```

**장점:** 실수로 삭제해도 복구 가능, 감사 추적 유지

---

## 10. Research Agent 추가 발견사항

### 10.1 Cross-Document Validation (문서 간 검증)
**현재:** 문서 간 데이터 정합성 검증 없음
**개선안:** 자동 불일치 감지 시스템

```
검증 규칙:
- PO vs PI: 수량, 제품 일치 여부 (가격은 다를 수 있음)
- PI vs CI: 최종 인보이스 금액이 PI 초과 시 경고
- CI vs Packing List: 총 수량, 중량 일치 여부
- Packing List vs Stuffing: 롤 개수 (package_no) 일치 여부
```

**구현:** 문서 저장 시 연결된 문서와 비교하여 불일치 항목을 warnings로 표시
**Phase:** 6 (Order Management에서 집계 시 함께 구현)

### 10.2 Trade/Shipment Parent Entity 개념 강화
**현재:** `orders` 테이블이 집계 역할
**개선안:** `orders`를 "Trade Transaction" 개념으로 강화

- 하나의 Trade Transaction이 전체 문서 체인의 부모
- Dashboard에서 각 거래가 파이프라인 어디에 있는지 시각화
- 거래 단위로 전체 타임라인 표시 (PO 생성 → PI 발행 → 선적 → 통관 → 배송)

### 10.3 Tiptap Template System with Variables
**현재:** Tiptap 에디터로 자유 형식 콘텐츠만 작성
**개선안:** 템플릿 + 변수 치환 시스템

```
Template 예시:
"{{buyer_name}} 귀하, {{po_number}} 건에 대해
선적일 {{ship_date}}으로 확인합니다."

→ 변수가 Tiptap 에디터 내에서 styled inline node로 표시
→ 저장/전송 시 실제 값으로 치환
```

**DB:** `content_templates` 테이블 (name, category, content_json, variables[])
**Phase:** Phase 4 (Contents System) 확장으로 구현

### 10.4 JWT Custom Claims for Performance
**현재 계획:** `app_metadata`에 org_type 저장
**개선안:** Supabase Auth Hook으로 JWT custom claims에 org_id, role 직접 삽입

```sql
-- RLS에서 subquery 없이 직접 접근 (성능 향상)
auth.jwt() ->> 'organization_id'
auth.jwt() ->> 'role'
```

**장점:** 매 쿼리마다 user_profiles 테이블 조회 불필요 → RLS 성능 크게 향상
**주의:** JWT에 캐싱되므로 역할 변경 시 토큰 갱신 필요

### 10.5 HS Code (관세 분류코드) 관리
**현재:** 제품에 name, gsm, width_mm만 저장
**개선안:** HS 코드 필드 추가

```sql
ALTER TABLE products ADD COLUMN hs_code TEXT;  -- e.g., '4806.40'
ALTER TABLE products ADD COLUMN duty_rate DECIMAL(5,2);  -- 관세율
```

**활용:**
- 통관 시 HS 코드 자동 입력
- 관세 예상 금액 자동 계산
- 한국 관세청(UNIPASS) 연동 가능성

### 10.6 Intent-based Actions Pattern (React Router 7)
**현재 계획:** 각 action별 별도 route 또는 단순 POST
**개선안:** 단일 route에서 intent 기반 다중 action 처리

```typescript
// 하나의 action에서 여러 mutation 처리
export async function action({ request }: ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "update-status": return handleStatusUpdate(formData);
    case "clone": return handleClone(formData);
    case "delete": return handleDelete(formData);
  }
}
```

**장점:** route 파일 수 감소, 관련 로직 응집도 향상

### 10.7 Optimistic Locking for Content Editing
**현재:** Last-write-wins
**개선안:** 버전 번호 기반 낙관적 잠금

```sql
ALTER TABLE contents ADD COLUMN version INT DEFAULT 1;

-- 저장 시 버전 체크
UPDATE contents SET body = $1, version = version + 1
WHERE id = $2 AND version = $3;
-- 0 rows affected = 충돌 발생 → 사용자에게 알림
```

---

## 11. Priority Ranking (개선 아이디어 우선순위)

| Priority | Improvement | Phase | Effort |
|----------|------------|-------|--------|
| P0 (필수) | app_metadata for RLS | Phase 1 | Low |
| P0 (필수) | RLS Index 생성 | Phase 1 | Low |
| P0 (필수) | Soft delete | Phase 1 | Low |
| P1 (높음) | Activity log | Phase 1 | Medium |
| P1 (높음) | Dashboard | Phase 2 | Medium |
| P1 (높음) | Global search (Cmd+K) | Phase 4 | Medium |
| P1 (높음) | Browser Print (Step 1 PDF) | Phase 2 | Low |
| P2 (중간) | Document presets | Phase 3 | Low |
| P2 (중간) | Notification system | Phase 6 | Medium |
| P2 (중간) | Exchange rate management | Phase 7 | Medium |
| P2 (중간) | Document chain visualization | Phase 6 | Medium |
| P3 (낮음) | Bulk actions | Phase 10 | Medium |
| P3 (낮음) | CSV/Excel export | Phase 10 | Low |
| P3 (낮음) | Statistics/Reports | Phase 10+ | High |
| P3 (낮음) | Keyboard shortcuts | Phase 10 | Low |
| **추가 발견** | | | |
| P0 (필수) | JWT custom claims (RLS 성능) | Phase 1 | Low |
| P1 (높음) | Cross-document validation | Phase 6 | Medium |
| P1 (높음) | Intent-based actions pattern | Phase 2 | Low |
| P2 (중간) | Trade timeline visualization | Phase 6 | Medium |
| P2 (중간) | HS Code 관리 | Phase 1 | Low |
| P2 (중간) | Tiptap template + variables | Phase 4 | High |
| P3 (낮음) | Optimistic locking | Phase 4 | Low |

---

## Sources

- [Supabase RLS Best Practices (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Supabase RLS Complete Guide 2026](https://designrevision.com/blog/supabase-row-level-security)
- [Multi-Tenant RLS Deep Dive (DEV.to)](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
- [Supabase Best Practices (Leanware)](https://www.leanware.co/insights/supabase-best-practices)
- [react-pdf Korean Font Issue #806](https://github.com/diegomura/react-pdf/issues/806)
- [react-pdf Font Fallback Issue #933](https://github.com/diegomura/react-pdf/issues/933)
- [Tiptap Image Upload (Official Docs)](https://tiptap.dev/docs/ui-components/components/image-upload-button)
- [Tiptap Best Practices (Liveblocks)](https://liveblocks.io/docs/guides/tiptap-best-practices-and-tips)
- [React Router 7 CRUD Patterns](https://www.netjstech.com/2025/06/crud-example-with-react-router-loader.html)
- [Import/Export Compliance Best Practices](https://skilldynamics.com/blog/import-export-compliance-guide/)
- [OECD Trade Digitalization Report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/09/the-digitalisation-of-trade-documents-and-processes_de6a03e9/64872f25-en.pdf)
- [Supply Chain Import/Export Documentation (ISM)](https://www.ism.ws/supply-chain/import-and-export-documentation/)
