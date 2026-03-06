# Phase 7: Customs Management - Domain Research Notes

**Date:** 2026-03-06
**Role:** Researcher

---

## 1. 한국 수입통관 비용 구조

수입통관 시 발생하는 비용은 여러 단계에서 여러 주체로부터 청구된다.

| DB 컬럼 | 한국어 명칭 | 포함 비용 항목 |
|---------|------------|--------------|
| `transport_fee` | 운송비 | CY->보세구역 내륙운송비 + THC + D/O Charge |
| `customs_fee` | 통관비 | 관세(Tariff) + 관세사 대행 수수료 |
| `vat_fee` | 부가세 | 수입 부가가치세 (과세표준 x 10%) |
| `etc_fee` | 기타비용 | 하역비, 보세창고 보관료, CFS 작업료, 검역비 등 |

- `customs_fee`에 관세와 관세사 수수료가 묶인 것은 GV가 일괄 대납 후 합산 청구하는 실무 관행 반영
- `vat_fee` 별도 분리: Saelim 매입세액공제 추적에 유용

---

## 2. `{supply, vat, total}` JSONB 구조와 세금계산서 표준

한국 부가가치세법 제32조에 따라 세금계산서에는 반드시 구분 표기:
- `supply` -> 공급가액 (세금계산서 항목 4)
- `vat` -> 부가세액 (세금계산서 항목 5)
- `total` -> 합계금액 = supply + vat (세금계산서 항목 6)

현재 DB JSONB 구조가 세금계산서 표준과 1:1 대응. 변경 불필요.

### vat_fee 해석 주의
- `vat_fee` JSONB의 supply 필드 = 수입부가세 금액 자체
- 수입 부가세는 그 자체가 세금이므로 일반적으로 `vat_fee.vat = 0`
- 즉, `{ supply: 1234567, vat: 0, total: 1234567 }` 형태가 일반 케이스

---

## 3. 통관번호(customs_no) 체계

한국 관세청 수입신고번호: **총 14자리**
```
신고인부호(5자리) + 년도(2자리) + 일련번호(7자리)
예: A12B3 25 0012345
```

- 관세청 UNI-PASS 전자통관시스템에서 수입신고 접수 시 자동 채번
- 신고 시점까지 번호 없음 -> `customs_no` nullable 설계 올바름
- **사용자 직접 입력** 방식이 적합 (자동 생성 불가)
- 2단계 워크플로우: 통관 레코드 먼저 생성 -> 신고 완료 후 번호 입력

---

## 4. fee_received 실무 워크플로우

```
1. 화물 부산 도착
2. GV가 통관 진행 (관세 대납, 관세사 수수료 지불, 운송 수배)
3. GV가 Saelim에게 세금계산서 발행 (4개 항목)
4. Saelim이 GV에게 송금
5. GV 담당자가 fee_received = true 토글
```

- `orders.customs_fee_received` = `customs.fee_received`의 투영(projection)
- `syncCustomsFeeToOrder`로 동기화

---

## 5. CY Free Time과 통관 기간 관계

- 부산항 FCL 기준: 일반적으로 **7~14일** (계약별 상이)
- CHP-GV-Saelim 무역: 14일 합리적 기본값
- Free Time 초과 시 Demurrage(체화료) 발생

CY 체류 기간 = `customs_date - arrival_date`
- Customs 모듈에서 `customs_date` 입력 -> Phase 6 CY 경고 배지 자동 확정
- Read-Through JOIN으로 별도 연동 코드 불필요

---

## 6. JSONB fee 데이터 관리 패턴

| 항목 | 현재 설계 | 대안 | 판정 |
|-----|---------|------|-----|
| Fee 구조 | JSONB {supply, vat, total} x 4 | 12개 별도 컬럼 | **현재 유지** |
| total 계산 | 서버 재계산 | 클라이언트 입력 | **서버 재계산** |
| customs_no | 사용자 입력, nullable | 자동 생성 | **사용자 입력** |
| fee_received | boolean | boolean + 수령일(date) | **boolean 유지** |
| CY 기준 | 14일 상수 | 선사별 설정 | **14일 상수** |

---

## 7. 구현 시 주의사항

1. `total = supply + vat`은 서버 액션에서 반드시 재계산 후 저장
2. `vat_fee.vat = 0`이 정상 케이스 -> UI에서 0 입력을 에러 처리하지 않을 것
3. `customs_no` 라벨: "수입신고번호 (선택)" 또는 "통관번호 (선택)"
4. `customs_date` 입력이 CY 경고 배지 종료 조건 -> 별도 코드 불필요
5. 비용 입력 UX: supply 입력 후 "부가세 자동계산(10%)" 옵션 제공 가능 (선택)
6. etc_fee + etc_desc: 500자 제한 충분 (예: "검역비 30,000 + 보관료 50,000")
