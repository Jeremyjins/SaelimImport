# Phase 9 PDF Generation - Analysis → Implementation Log

**Date:** 2026-03-06
**Ref:** `.claude/docs/PROJECT_INIT_ANALYZE_PHASE_9.md`

---

## Summary

Phase 9 분석 결과 1건의 FAIL + 3건의 Should Fix 발견. 모두 즉시 구현 완료.

---

## Agent Team

| # | Role | 담당 |
|---|------|------|
| 1 | Architect | 파일 구조/번들 전략 — PASS (별도 작업 없음) |
| 2 | Frontend Dev | PDF 컴포넌트 — PASS (별도 작업 없음) |
| 3 | Code Reviewer | Route 통합 FAIL 수정 |
| 5 | Perf Analyzer | triggerDownload 방어 코드 |
| 6 | Security Reviewer | 파일명 sanitization |

**제외:** Backend Dev (DB 변경 없음), Tester, Researcher

---

## 구현 항목

### Fix-1 (FAIL → FIXED): customs route DropdownMenuTrigger 스타일 불일치

**File:** `app/routes/_layout.customs.$id.tsx:131`
**Agent:** Code Reviewer

**변경 전:**
```tsx
<Button variant="outline" size="sm" disabled={isDeleting || isPDFLoading}>
  {isDeleting || isPDFLoading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <MoreHorizontal className="h-4 w-4" />
  )}
</Button>
```

**변경 후:**
```tsx
<Button variant="outline" size="icon" className="h-8 w-8" disabled={isDeleting}>
  {isDeleting ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <MoreHorizontal className="h-4 w-4" />
  )}
</Button>
```

**이유:**
- `size="icon" className="h-8 w-8"` — PO/PI/Shipping route와 동일한 스타일
- Trigger `disabled`에서 `isPDFLoading` 제거 → PDF 로딩 중에도 메뉴 열 수 있음
- 개별 DropdownMenuItem에는 `disabled={isPDFLoading}` 유지 (인보이스 다운로드 항목)
- Loader spinner도 `isDeleting`만 감시 (PDF 로딩 피드백은 toast로 처리)

---

### Fix-2 (Should Fix → FIXED): 파일명 sanitization

**File:** `app/components/pdf/shared/pdf-utils.ts:triggerDownload`
**Agent:** Security Reviewer

**변경 전:**
```typescript
a.download = filename;
```

**변경 후:**
```typescript
const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
// ...
a.download = safeName;
```

**이유:** DB 값(`customs_no` 등)이 파일명에 직접 사용되므로 특수문자 제거. 현재 위험도 Low이나 방어적 코딩으로 적용.

---

### Fix-3 (Should Fix → FIXED): triggerDownload DOM 클린업 방어

**File:** `app/components/pdf/shared/pdf-utils.ts:triggerDownload`
**Agent:** Perf Analyzer

**변경 전:**
```typescript
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

**변경 후:**
```typescript
try {
  a.click();
} finally {
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**이유:** `a.click()` 예외 발생 시 orphan `<a>` 엘리먼트와 Blob URL leak 방지. Fix-2와 함께 적용.

---

### Fix-4 (Should Fix - 보류): CI Pipeline 번들 오염 검증

**File:** CI 파이프라인 (미구현)
**이유:** 현재 CI 파이프라인 미설정 상태. `npm run build` 후 수동 검증 권장.

**수동 검증 명령:**
```bash
npm run build && node -e "const fs=require('fs'); const s=fs.readFileSync('dist/_worker.js','utf8'); if(s.includes('react-pdf')) { console.error('FAIL: react-pdf found in SSR bundle'); process.exit(1); } console.log('PASS: SSR bundle clean');"
```

---

## File Ownership

| 파일 | 에이전트 | 변경 |
|------|---------|------|
| `app/routes/_layout.customs.$id.tsx` | Code Reviewer | Fix-1 |
| `app/components/pdf/shared/pdf-utils.ts` | Security + Perf | Fix-2, Fix-3 |

---

## 최종 상태

| 항목 | 이전 | 이후 |
|------|------|------|
| FAIL | 1 | 0 |
| Should Fix | 3 | 1 (CI 파이프라인, 보류) |
| WARN (Info) | 2 | 2 (유지) |

Phase 9 PDF Generation 구현 완료. 모든 Must Fix 및 주요 Should Fix 처리됨.
