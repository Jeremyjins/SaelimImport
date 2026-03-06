# Phase 3: PI Module - Security Review Notes

**Date:** 2026-03-06
**Role:** Security Reviewer

---

## 1. 위협 모델

### 핵심 보안 목표: 이중 가격 격리

1. **PO 구매단가** (CHP->GV): Saelim 및 클라이언트에 절대 노출 금지
2. **PI 판매단가** (GV->Saelim): Saelim에게도 노출 금지 (PI는 GV 내부 영업 문서)

### 공격자 유형

| 유형 | 능력 | 동기 |
|------|------|------|
| 악의적 Saelim 사용자 | 유효 쿠키, DevTools | GV 마진 파악, 구매단가 확인 |
| 세션 탈취자 | 훔친 쿠키/JWT | 사업 정보 획득 |

### 고가치 타겟

| 데이터 | 민감도 | 위치 |
|--------|--------|------|
| PO details[].unit_price | Critical | purchase_orders.details JSONB |
| PI details[].unit_price | Critical | proforma_invoices.details JSONB |
| PI amount | High | proforma_invoices.amount |
| PI po_id | Medium | PO 연결 역추적 가능 |

---

## 2. RLS 정책 분석

### 계획된 정책 (Phase 0 마이그레이션)

```sql
-- proforma_invoices: GV 전용
CREATE POLICY "gv_all" ON proforma_invoices
  FOR ALL USING (get_user_org_type() = 'gv');
-- Saelim 정책: 없음 -> Saelim은 PI 접근 불가

-- deliveries: GV 전체 + Saelim 읽기
CREATE POLICY "gv_all" ON deliveries FOR ALL USING (get_user_org_type() = 'gv');
CREATE POLICY "saelim_read" ON deliveries FOR SELECT USING (get_user_org_type() = 'saelim');
```

### 구현 전 반드시 검증

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('proforma_invoices', 'deliveries')
ORDER BY tablename, policyname;
```

---

## 3. Delivery를 통한 PI 간접 접근 분석

```
Saelim이 볼 수 있는 테이블: deliveries (SELECT), shipping_documents (SELECT)

위험 경로 1: PostgREST FK join
  GET /rest/v1/deliveries?select=*,proforma_invoices(*)
  -> proforma_invoices RLS가 Saelim 접근 차단 -> 안전

위험 경로 2: deliveries.pi_id UUID 노출
  -> UUID 자체는 의미 없음 (PI 직접 조회 RLS에서 차단)
  -> 안전

위험 경로 3: shipping_documents 경유
  -> shipping_documents.amount, details에 판매가격 포함 가능
  -> RLS는 행 레벨만 제어, 컬럼 레벨은 애플리케이션에서 필터링 필수
```

**핵심:** RLS는 행 레벨 제어만 한다. Saelim 접근 가능 테이블의 민감 컬럼은 loader에서 명시적 제외 필수.

---

## 4. Saelim Delivery 뷰 허용 데이터

| 필드 | 허용 | 이유 |
|------|------|------|
| deliveries.id | O | 식별자 |
| deliveries.delivery_date | O | 배송 일자 |
| shipping_docs.vessel, voyage, eta | O | 배송 추적 |
| pi.details[].product_name | O | 제품명 공개 가능 |
| pi.details[].quantity_kg | O | 수량 공개 가능 |
| pi.details[].unit_price | **X** | 판매단가 절대 금지 |
| pi.amount | **X** | 판매 총액 절대 금지 |
| pi.po_id | **X** | PO 연결 역추적 |
| po 관련 모든 데이터 | **X** | 구매 정보 절대 금지 |

---

## 5. PI CRUD 인증/인가

### 이중 방어 필수

모든 PI loader/action에서 `requireGVUser` 독립 호출. `_layout.tsx` 레이아웃 가드만으로 불충분 (직접 HTTP 호출 우회 가능).

```typescript
// 모든 PI loader/action 첫 줄
const { supabase, responseHeaders } = await requireGVUser(request, context);
```

### PO 참조 생성 보안

- `from_po` URL param: `z.string().uuid()` 검증
- 삭제된 PO 참조 차단: `.is("deleted_at", null)` 체크
- 완료된 PO -> PI 생성: 허용 (비즈니스 규칙상 자연스러움)

---

## 6. PI 생성 시 Delivery 자동 생성 보안

### 트랜잭션 시나리오

| 시나리오 | 결과 | 대응 |
|---------|------|------|
| PI 성공 + Delivery 성공 | 정상 | - |
| PI 성공 + Delivery 실패 | 고아 PI | PI soft delete 롤백 |
| PI 실패 | Delivery 미생성 | 에러 반환 |

### SECURITY DEFINER 주의

RPC 함수 사용 시 `SECURITY DEFINER`는 RLS 우회. 호출 전 `requireGVUser` 필수.

---

## 7. 구현 보안 체크리스트

### Critical

- [ ] 모든 PI loader에서 `requireGVUser` 호출
- [ ] 모든 PI action에서 `requireGVUser` 호출
- [ ] proforma_invoices RLS에 Saelim SELECT 정책 없음 확인
- [ ] PI details JSONB Zod 검증 (최대 20개)
- [ ] PI amount 서버사이드 재계산 (클라이언트 값 무시)
- [ ] from_po URL param UUID 검증
- [ ] PI 삭제 시 Delivery 함께 soft delete
- [ ] Saelim delivery loader에서 PI 가격 컬럼 제외
- [ ] created_by = user.id (requireGVUser에서 반환)

### Warning

- [ ] PI 생성 시 PO 구매단가를 PI 단가로 그대로 복사하지 않도록 UI 안내
- [ ] complete 상태 PI update 차단
- [ ] 삭제된 PO 참조 PI 생성 차단
- [ ] 알 수 없는 _action에 400 반환
- [ ] notes 최대 2000자 제한

### Phase 2에서 확립된 보안 기반 (PI에도 적용)

- app_metadata 기반 RLS (사용자 수정 불가)
- Supabase getUser() 서버 검증
- UUID primary key (열거 공격 방지)
- Parameterized queries (SQL injection 방지)
- React JSX 기본 escape (XSS 방지)
- SERVICE_ROLE_KEY 서버 코드 격리
