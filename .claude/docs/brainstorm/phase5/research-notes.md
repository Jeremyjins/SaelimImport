# Phase 5: Shipping Documents - Researcher Notes

**Date:** 2026-03-06
**Role:** Researcher
**Scope:** Phase 5 기술 조사 - CSV 파싱, 선적서류 표준, 중량 계산, UX 패턴, ETD/ETA 관례

---

## Topic 1: CSV Parsing in Cloudflare Workers

### 조사 결과

**요구사항 정리:**
- CF Workers 엣지 런타임 (Node.js `fs` 없음, `nodejs_compat` 플래그 활성)
- 한국어 텍스트 포함 가능 (UTF-8)
- 인용 필드(quoted fields) 처리 필요
- 파일 크기 < 1MB (스터핑 리스트는 전형적으로 < 500행)
- 스트리밍 불필요
- **Architect 결정:** 클라이언트 사이드 파싱 (브라우저에서 파싱 후 JSON으로 서버 전송)

**옵션 비교:**

| 라이브러리 | CF Workers 호환 | 번들 크기 | RFC 4180 | UTF-8 | 동기 파싱 | 비고 |
|-----------|---------------|----------|----------|-------|---------|------|
| **PapaParse** | 완전 호환 | ~46KB (min) | 완전 | 지원 | 지원 | 의존성 없음, 브라우저 네이티브 |
| csv-parse/sync | 불확실 | ~100KB+ | 완전 | 지원 | 지원 | Node.js Stream API 의존, CF Workers 문제 있음 |
| d3-dsv | 완전 호환 | ~6KB (min) | 완전에 가까움 | 지원 | 지원 | 매우 가벼움, D3 생태계 의존 |
| 수동 String.split() | 완전 호환 | 0 | 부분 | 지원 | 지원 | 인용 필드, 이스케이프 처리 취약 |

### 권장사항

**PapaParse 사용 권장** - 순수 JavaScript, 의존성 없음, RFC 4180 완전 준수.

```bash
npm install papaparse @types/papaparse
```

```typescript
// app/lib/csv-parser.ts
import Papa from "papaparse";
import { stuffingRollSchema } from "~/loaders/shipping.schema";
import type { StuffingRollDetail } from "~/types/shipping";

export interface CSVParseResult {
  rows: StuffingRollDetail[];
  errors: { row: number; message: string }[];
}

export function parseStuffingCSV(csvText: string): CSVParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows: StuffingRollDetail[] = [];
  const errors: { row: number; message: string }[] = [];

  result.data.forEach((raw, i) => {
    const parsed = stuffingRollSchema.safeParse({
      roll_no: Number(raw.roll_no),
      product_name: raw.product_name?.trim(),
      gsm: Number(raw.gsm),
      width_mm: Number(raw.width_mm),
      length_m: Number(raw.length_m),
      net_weight_kg: Number(raw.net_weight_kg),
      gross_weight_kg: Number(raw.gross_weight_kg),
    });

    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      errors.push({
        row: i + 2,
        message: parsed.error.issues[0]?.message ?? "유효하지 않은 행",
      });
    }
  });

  return { rows, errors };
}
```

**번들 크기:** ~46KB (minified). 클라이언트 전용 임포트 (SSR 번들 미포함).

---

## Topic 2: 스터핑 리스트 / 패킹 리스트 업계 표준 패턴

### 컨테이너 번호 형식 (ISO 6346)

```
ABCU 1234567
||| └─ 7자리 숫자 (6자리 시리얼 + 1자리 체크 디지트)
|||
|└┘ Owner Code 3자 + Equipment Category Identifier 1자 (U=범용)
```

**예시:** `TEMU1234567`, `MSCU9876543`, `HLXU2345671`

**권장 Zod 정규식:** `/^[A-Z]{4}\d{7}$/` (간소화 검증, 선택적 적용)

**봉인 번호(Seal No):** 표준 없음. 자유 텍스트 저장.

### 롤 번호 관례

- **순차 번호:** 1부터 시작하는 정수 (전체 선적 기준)
- **범위 표기:** `1-120`, `121-240` 형태
- **컨테이너 간 연속성:** 컨테이너 1에 1-120, 컨테이너 2에 121-240

`roll_no_range`는 `min(roll_no)-max(roll_no)` 자동 계산 가능.

### CSV 템플릿 구조

```
Roll No | Product | GSM | Width (mm) | Length (m) | Net Weight (kg) | Gross Weight (kg)
```

Architect 설계의 7개 필드와 일치. MVP에 충분.

---

## Topic 3: CI/PL 문서 번호 전략

### 업계 관례

- CI와 PL은 같은 선적 건에 대한 두 시각 (가격 vs 물리적 상세)
- **동일 참조 번호** 사용이 표준 관행 (세관 교차 검증 용이)
- 독립 시퀀스는 번호 불일치 위험

### Architect 결정 검증

```
ci_no = GVCI2603-001
pl_no = GVPL2603-001  (ci_no에서 prefix만 치환)
```

**검증됨.** 업계 관례와 일치, 구현 단순.

```typescript
const { data: ciNo } = await supabase.rpc("generate_doc_number", {
  doc_type: "CI", ref_date: ci_date,
});
const plNo = ciNo!.replace("GVCI", "GVPL"); // GVPL2603-001
```

`document_sequences` 테이블에 CI 시퀀스만 추가하면 됨. PL은 독립 시퀀스 불필요.

---

## Topic 4: 중량 계산 패턴

### 종이 롤 중량 정의

| 용어 | 정의 | 비고 |
|------|------|------|
| **Net Weight** | 종이 자체 무게 | 롤별 실측 합산 |
| **Gross Weight** | 종이 + 포장재 + 팔레트 | 롤별 gross 합산 |
| **Tare Weight** | 포장재 + 팔레트 | Gross - Net, 약 1-3% |

40gsm 787mm 롤(~220kg net)의 경우 Gross는 약 224-226kg.

### 소수점 자릿수

- 중량 필드: 소수점 2자리 (e.g., 220.50 kg)
- 집계 시: `Math.round(x * 100) / 100` 적용

### 집계 로직

```typescript
async function recalcWeightsFromStuffing(supabase, shippingDocId: string) {
  const { data: stuffingLists } = await supabase
    .from("stuffing_lists")
    .select("roll_details")
    .eq("shipping_doc_id", shippingDocId);

  let netWeight = 0, grossWeight = 0, packageNo = 0;

  for (const sl of stuffingLists ?? []) {
    const rolls = sl.roll_details ?? [];
    for (const roll of rolls) {
      netWeight += roll.net_weight_kg;
      grossWeight += roll.gross_weight_kg;
    }
    packageNo += rolls.length;
  }

  await supabase
    .from("shipping_documents")
    .update({
      net_weight: Math.round(netWeight * 100) / 100,
      gross_weight: Math.round(grossWeight * 100) / 100,
      package_no: packageNo,
    })
    .eq("id", shippingDocId);
}
```

---

## Topic 5: React CSV 업로드 UX 패턴

### 권장 플로우

```
파일 선택 (input[type="file"])
  └─> 클라이언트 파싱 (PapaParse)
      └─> 프리뷰 다이얼로그 (파싱된 행 테이블)
          ├─> 오류 행 하이라이트 (빨간색 배경)
          ├─> 유효 행 개수 표시
          └─> 확인 버튼 클릭
              └─> JSON 직렬화 후 서버 액션으로 전송
```

**클라이언트 파싱 방식 장점:**
- 프리뷰 전 네트워크 왕복 없음
- CF Workers 파일 업로드 복잡도 회피
- 오류 즉시 표시

### UX 설계

```
┌─ CSV 업로드 ────────────────────────────────────────┐
│  CSV 파일 선택                   [파일 선택] 또는 드래그 │
│  총 120행 | 유효: 118행 | 오류: 2행                    │
│  ┌─────┬──────────────┬─────┬──────┬────────┐       │
│  │Roll │Product       │GSM  │Net   │Gross   │       │
│  │  1  │Glassine Paper│ 40  │220.5 │224.8   │       │
│  │  3  x 오류: net_weight_kg 필요              │       │
│  └─────┴──────────────┴─────┴──────┴────────┘       │
│  기존 데이터:  ○ 대체  ● 추가                          │
│             [취소]         [118행 가져오기]             │
└────────────────────────────────────────────────────┘
```

### CSV 템플릿 다운로드

```typescript
function downloadTemplate() {
  const header = "roll_no,product_name,gsm,width_mm,length_m,net_weight_kg,gross_weight_kg\n";
  const example = "1,Glassine Paper,40,787,7000,220.50,224.80\n";
  const blob = new Blob([header + example], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stuffing_list_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## Topic 6: ETD/ETA 및 선박/항차 번호

### ETD/ETA

| 용어 | 한국어 | 형식 |
|------|--------|------|
| **ETD** | 출항예정일 | YYYY-MM-DD |
| **ETA** | 도착예정일 | YYYY-MM-DD |
| **ship_date** | 선적일 (화물 적재일) | YYYY-MM-DD |

세 필드는 의미가 다름. 모두 필요. **Architect 설계 검증됨.**

### 선박명/항차 번호

- **Vessel:** 대문자 또는 혼합 (예: `EVER GIVEN`). 최대 ~35자.
- **Voyage:** 선사별 독자 형식 (예: `0123E`, `V.123`). 최대 ~20자.

### 한국-대만 항로

| 구간 | 항해 시간 |
|------|----------|
| Keelung → Busan | 2-3일 |
| Kaohsiung → Busan | 3-4일 |
| Taichung → Busan | 3-4일 |

**주요 항구:**
- 대만: Keelung(TWKEL), Taichung(TWTXG), Kaohsiung(TWKHH)
- 한국: Busan(KRPUS), Incheon(KRICN)

**CY 체류일 (Phase 6 참고):** Free Time 일반 7-14일. ETA 기준 계산.

---

## 종합 권장 사항

1. **PapaParse 설치 사용** - 수동 CSV 파서 대신. `npm install papaparse @types/papaparse`
2. **컨테이너 번호** - ISO 6346 `/^[A-Z]{4}\d{7}$/` 선택적 검증
3. **CSV 템플릿 다운로드** - 업로드 다이얼로그에 버튼 추가
4. **중량 소수점** - `Math.round(x * 100) / 100` 필수
5. **ship_date vs ETD 구분** - UI에서 명확히 ("선적일: 화물 적재일" vs "출항예정일: 선박 출항일")
6. **CI/PL 공유 시퀀스** - generate_doc_number('CI') + string replace로 PL 도출

---

## Sources

- [Papa Parse Official Docs](https://www.papaparse.com/docs)
- [ISO 6346 Container Coding](https://en.wikipedia.org/wiki/ISO_6346)
- [Commercial Invoice + Packing List - Flexport](https://www.flexport.com/help/24-commercial-invoice-packing-list/)
- [Tare, Net, Gross Weight - Maersk](https://www.maersk.com/logistics-explained/shipping-documentation/2024/09/16/gross-tare-net-weight)
- [ETD/ETA in Shipping - Marine Insight](https://www.marineinsight.com/maritime-law/etd-and-eta-in-shipping/)
- [CF Workers Node.js Compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Taiwan to South Korea Routes](https://www.fluentcargo.com/routes/taiwan/south-korea)
