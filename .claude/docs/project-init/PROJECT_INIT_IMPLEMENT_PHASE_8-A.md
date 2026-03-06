# Phase 8-A: GV Delivery Management - 구현계획

**Date:** 2026-03-06
**Status:** 구현 중
**참조:** PROJECT_INIT_BRAINSTORMING_PHASE_8.md

---

## 구현 목표

GV 사용자가 배송을 조회, 관리, 변경요청을 승인/반려할 수 있는 Delivery Management 모듈 구현.

---

## 팀 구성

| 역할 | 담당 파일 |
|------|----------|
| Architect | DB 스키마, 라우트 구조, Sync 설계 |
| Backend Dev | delivery.server.ts, delivery.$id.server.ts, delivery.schema.ts |
| Frontend Dev | _layout.delivery.tsx, _layout.delivery.$id.tsx, components/delivery/ |
| Security Reviewer | RLS 정책, CRIT 보안 요건 검증 |

---

## Task 목록

### DB Migration
- [x] **TASK-1**: `deliveries.status` 컬럼 추가 (pending/scheduled/delivered)
- [x] **TASK-2**: `delivery_change_requests.responded_at` 컬럼 추가
- [x] **TASK-3**: RLS 정책 생성 (deliveries + delivery_change_requests)
- [x] **TASK-4**: 성능 인덱스 생성
- [x] **TASK-5**: `app/types/database.ts` 재생성 (Supabase MCP generate_typescript_types 사용)

### Types & Content 확장
- [x] **TASK-6**: `app/types/delivery.ts` 생성 (DeliveryDetail, DeliveryListItem, ChangeRequest)
- [x] **TASK-7**: `app/types/content.ts` - ContentType에 "delivery" 추가
- [x] **TASK-8**: `app/lib/content.server.ts` - PARENT_TABLE_MAP에 delivery 추가

### Sync 로직
- [x] **TASK-9**: `app/lib/order-sync.server.ts` - `unlinkDeliveryFromOrder()` 추가
- [x] **TASK-10**: `app/lib/order-sync.server.ts` - `syncDeliveryDateFromOrder()` 추가
- [x] **TASK-11**: `app/loaders/orders.$id.server.ts` - delivery_date 역방향 sync 버그 수정

### Backend (GV)
- [x] **TASK-12**: `app/loaders/delivery.schema.ts` - Zod 스키마
- [x] **TASK-13**: `app/loaders/delivery.server.ts` - 목록 loader
- [x] **TASK-14**: `app/loaders/delivery.$id.server.ts` - 상세 loader + action

### Frontend (GV)
- [x] **TASK-15**: `app/routes/_layout.delivery.tsx` - 실제 목록 구현
- [x] **TASK-16**: `app/routes/_layout.delivery.$id.tsx` - 상세 페이지
- [x] **TASK-17**: `app/components/delivery/change-request-badge.tsx`
- [x] **TASK-18**: `app/components/delivery/change-request-card.tsx`
- [x] **TASK-19**: `app/components/delivery/delivery-info-card.tsx`

### Route 등록
- [x] **TASK-20**: `app/routes.ts` - `delivery/:id` 추가

---

## 파일 목록

### 신규 파일
```
app/types/delivery.ts
app/loaders/delivery.server.ts
app/loaders/delivery.$id.server.ts
app/loaders/delivery.schema.ts
app/routes/_layout.delivery.$id.tsx
app/components/delivery/change-request-badge.tsx
app/components/delivery/change-request-card.tsx
app/components/delivery/delivery-info-card.tsx
```

### 수정 파일
```
app/routes.ts                          # delivery/:id 추가
app/routes/_layout.delivery.tsx        # 플레이스홀더 → 실제 목록
app/lib/order-sync.server.ts           # unlinkDeliveryFromOrder + syncDeliveryDateFromOrder
app/loaders/orders.$id.server.ts       # 역방향 delivery_date sync 연결
app/types/content.ts                   # ContentType에 "delivery" 추가
app/lib/content.server.ts              # PARENT_TABLE_MAP에 delivery 추가
app/types/database.ts                  # 마이그레이션 후 상태 갱신
```

---

## 보안 체크리스트

- [x] CRIT-4: GV 전용 Action (approve/reject) - requireGVUser 사용
- [x] CRIT-3: requested_by 서버사이드 설정 (Phase 8-B Saelim 구현 시)
- [x] CRIT-5: RLS 활성화 완료
- [x] App-level: 삭제된 배송 요청 차단 (deleted_at IS NULL 확인)
- [x] App-level: 요청 스팸 차단 (대기 중 요청 존재 시 거부)

---

## 구현 노트

### delivery_date 역방향 sync 버그 수정
`orders.$id.server.ts`의 `update_fields` 액션에서 `delivery_date` 변경 시
`deliveries` 테이블에도 동기화하도록 `syncDeliveryDateFromOrder()` 함수를 추가하고 호출.

### approve_request 로직
변경요청 승인 시:
1. `delivery_change_requests.status` = 'approved', `responded_by` = user.id, `responded_at` = now()
2. `deliveries.delivery_date` = requested_date
3. `deliveries.status` = 'scheduled'
4. `syncDeliveryDateToOrder()` 호출 (연결된 Order 동기화)

### reject_request 로직
변경요청 반려 시:
1. `delivery_change_requests.status` = 'rejected', `responded_by` = user.id, `responded_at` = now(), `response_text` = 사유
2. `deliveries` 업데이트 없음

### update_delivery_date 로직
GV 인라인 날짜 수정 시:
1. `deliveries.delivery_date` 업데이트
2. `deliveries.status` = date ? 'scheduled' : 'pending'
3. `syncDeliveryDateToOrder()` 호출
