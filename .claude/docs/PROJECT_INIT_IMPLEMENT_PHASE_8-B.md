# Phase 8-B: Saelim Portal - 구현계획

**Date:** 2026-03-06
**Status:** 구현 완료
**참조:** PROJECT_INIT_BRAINSTORMING_PHASE_8.md, PROJECT_INIT_IMPLEMENT_PHASE_8-A.md

---

## 구현 목표

Saelim 사용자가 배송 현황을 조회하고, 배송일 변경요청을 제출할 수 있는 포털 구현.
가격 정보(금액, 통화 등) 완전 차단 + RLS 기반 데이터 격리.

---

## 팀 구성

| 역할 | 담당 파일 |
|------|----------|
| Backend Dev | saelim.delivery.server.ts, saelim.delivery.$id.server.ts, delivery.schema.ts (확장) |
| Frontend Dev | _saelim.delivery.tsx, _saelim.delivery.$id.tsx, change-request-form.tsx |
| Security Reviewer | CRIT-1~3 검증, org_type 체크, 가격 필드 노출 차단 |

---

## Task 목록

### Backend (Saelim)
- [x] **TASK-1**: `app/loaders/delivery.schema.ts` - submitChangeRequestSchema 추가
- [x] **TASK-2**: `app/loaders/saelim.delivery.server.ts` - 배송 목록 loader (가격 제외)
- [x] **TASK-3**: `app/loaders/saelim.delivery.$id.server.ts` - 배송 상세 loader + submit_change_request action

### Frontend (Saelim)
- [x] **TASK-4**: `app/components/delivery/change-request-form.tsx` - 변경요청 입력 폼 컴포넌트
- [x] **TASK-5**: `app/routes/_saelim.delivery.tsx` - 플레이스홀더 → 실제 목록
- [x] **TASK-6**: `app/routes/_saelim.delivery.$id.tsx` - 배송 상세 페이지 (신규)

### Route 등록
- [x] **TASK-7**: `app/routes.ts` - `saelim/delivery/:id` 추가

---

## 파일 목록

### 신규 파일
```
app/loaders/saelim.delivery.server.ts
app/loaders/saelim.delivery.$id.server.ts
app/routes/_saelim.delivery.$id.tsx
app/components/delivery/change-request-form.tsx
```

### 수정 파일
```
app/loaders/delivery.schema.ts         # submitChangeRequestSchema 추가
app/routes/_saelim.delivery.tsx        # 플레이스홀더 → 실제 목록
app/routes.ts                          # saelim/delivery/:id 추가
```

---

## 보안 체크리스트

- [x] CRIT-1: PI/Shipping SELECT에 가격 필드(currency, amount 등) 완전 제외
- [x] CRIT-2: 모든 loader/action에서 org_type === 'saelim' 검증
- [x] CRIT-3: requested_by = user.id 서버사이드 설정 (FormData 무시)
- [x] App-level: 과거 날짜 변경요청 거부 (requested_date > today)
- [x] App-level: 대기 중 요청 존재 시 신규 요청 거부 (스팸 방지)
- [x] App-level: 삭제된 배송에 요청 불가 (deleted_at IS NULL 확인)

---

## 데이터 설계

### Saelim 목록 데이터 (가격 제외)
```typescript
interface SaelimDeliveryListItem {
  id: string;
  delivery_date: string | null;
  status: string;
  created_at: string | null;
  pi: { id: string; pi_no: string } | null;
  shipping: { id: string; ci_no: string; vessel: string | null; eta: string | null } | null;
  my_pending_request: boolean; // 내 대기 중 요청 존재 여부
}
```

### Saelim 상세 데이터 (가격 제외)
```typescript
interface SaelimDeliveryDetail {
  id: string;
  delivery_date: string | null;
  status: string;
  pi: { id: string; pi_no: string } | null;
  shipping: {
    id: string;
    ci_no: string;
    vessel: string | null;
    voyage: string | null;
    eta: string | null;
    etd: string | null;
  } | null;
  my_change_requests: ChangeRequest[]; // 본인 요청만
}
```

---

## Action 설계 (submit_change_request)

```
POST saelim/delivery/:id
_action: submit_change_request
requested_date: YYYY-MM-DD (미래 날짜, 필수)
reason: string (선택, max 500자)
```

**서버사이드 검증:**
1. org_type === 'saelim' (requireSaelimUser)
2. delivery 존재 + deleted_at IS NULL
3. requested_date > today (과거 날짜 거부)
4. 기존 pending 요청 없음 (스팸 방지)
5. requested_by = user.id (서버사이드 강제)

---

## 구현 노트

### requireSaelimUser 패턴
requireAuth에서 org_type 체크를 추가하는 방식으로 inline 구현.
(auth.server.ts에 함수 추가 불필요 - loader 내에서 직접 처리)

### Saelim SELECT 쿼리 패턴
```typescript
// 가격 필드 절대 제외
const SAELIM_DELIVERY_SELECT =
  "id, delivery_date, status, created_at, " +
  "pi:proforma_invoices!pi_id(id, pi_no), " +  // currency, amount 제외
  "shipping:shipping_documents!shipping_doc_id(id, ci_no, vessel, eta, etd, voyage)";
  // 가격 관련 필드 제외
```

---

## 구현 완료 내용

### Pencil MCP 디자인 (saelim.pen)
- **Saelim Delivery - 목록** 프레임 (ID: 1JTLS): 탭 필터 + 카드 목록 레이아웃
- **Saelim Delivery - 상세** 프레임 (ID: wkvSm): 배송정보 카드 + 변경요청 폼 + 내역 섹션

### 신규 구현 파일

**`app/loaders/delivery.schema.ts`** (수정)
- `submitChangeRequestSchema` 추가: requested_date (미래 날짜 Zod refine), reason (max 500자 선택)

**`app/loaders/saelim.delivery.server.ts`** (신규)
- requireAuth + org_type === 'saelim' 검증
- SAELIM_DELIVERY_LIST_SELECT: 가격 필드 제외 (pi_no, ci_no, vessel, eta만)
- 본인 대기 중 요청 여부 (my_pending_request) 앱 레벨 계산

**`app/loaders/saelim.delivery.$id.server.ts`** (신규)
- loader: 배송 상세 + 본인 변경요청 내역 (requested_by = user.id 필터)
- action(submit_change_request):
  1. org_type === 'saelim' 검증
  2. 배송 존재 + deleted_at IS NULL 확인
  3. 기존 pending 요청 스팸 방지
  4. requested_by = user.id 서버사이드 강제 설정

**`app/components/delivery/change-request-form.tsx`** (신규)
- hasPendingRequest prop: true면 대기 중 안내 메시지 표시
- 날짜 선택 (min=오늘), 사유 입력 (max 500자 카운터)
- fetcher 기반 submit + Toast 피드백
- Send 아이콘 사용 (icons.tsx에 추가)

**`app/routes/_saelim.delivery.tsx`** (교체)
- 플레이스홀더 → 실제 목록 (tabs + 카드 리스트)
- max-w-3xl 중앙 정렬 (사이드바 없음)
- 변경요청 대기 뱃지 표시

**`app/routes/_saelim.delivery.$id.tsx`** (신규)
- 배송 정보 읽기 전용 카드 (가격 없음)
- ChangeRequestForm (delivered 상태 제외)
- 내 변경요청 내역 (status별 뱃지, 거부 사유 표시)

**`app/routes.ts`** (수정)
- `saelim/delivery/:id` → `routes/_saelim.delivery.$id.tsx` 등록

**`app/components/ui/icons.tsx`** (수정)
- `Send` 아이콘 추가

### TypeScript 검증
- `npm run typecheck` → EXIT: 0 (오류 없음)
