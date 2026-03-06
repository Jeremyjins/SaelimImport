# Research Notes: Saelim Import Management System

**Date:** 2026-03-06

---

## 1. PDF Generation Library Comparison

| Library | Runtime | Korean Font | Bundle Size | DX | Recommendation |
|---------|---------|-------------|-------------|-----|----------------|
| @react-pdf/renderer | Client | Custom font embed | ~500KB + font | React components | Best for this project |
| pdf-lib | Any JS | Font embed | ~200KB + font | Imperative API | Good alternative |
| jsPDF | Client | Plugin needed | ~300KB + font | Imperative | Dated API |
| pdfmake | Client | Custom font | ~400KB + font | Declarative | Good but heavy |
| Puppeteer | Server only | System fonts | N/A | HTML → PDF | Not on CF Workers |
| html-pdf-node | Server only | System fonts | N/A | HTML → PDF | Not on CF Workers |

### @react-pdf/renderer (Recommended Primary)
**Pros:**
- React 컴포넌트로 PDF 정의 → DX 최고
- Custom font 지원 (registerFont)
- Client-side generation → 서버 부담 없음
- 테이블, 이미지, 페이지 나누기 지원

**Cons:**
- 한국어 폰트 크기 (전체: 5-15MB)
- 초기 로딩 시 폰트 다운로드 필요
- 일부 CSS 미지원 (flexbox 기반)

### pdf-lib (Recommended Fallback)
**Pros:**
- Any JS runtime (Cloudflare Workers 포함)
- 낮은 번들 크기
- PDF 수정/병합 가능

**Cons:**
- Low-level API (테이블 직접 그려야 함)
- Layout engine 없음

---

## 2. Korean Font Challenge & Solutions

### Font Size Analysis
| Font | Full Set | Subset (Business) | Format |
|------|----------|-------------------|--------|
| Noto Sans KR Regular | ~4.5MB (OTF) | ~500-800KB | woff2 |
| Noto Sans KR Bold | ~4.5MB (OTF) | ~500-800KB | woff2 |
| Pretendard Regular | ~5MB | ~600KB | woff2 |
| Spoqa Han Sans Neo | ~3MB | ~400KB | woff2 |

### Font Subsetting Strategy

**비즈니스 문서에 사용되는 한글 범위:**
- 한글 완성형: ~2,350자 (KS X 1001 기본 한글)
- 비즈니스 용어: ~500-1000자면 충분
- 숫자, 영문, 특수문자: ~200자

**도구:**
- `fonttools` (Python) - `pyftsubset`
- `glyphhanger` - Web font subsetting
- `subfont` - Automatic subsetting

**Subset 생성 방법:**
```bash
# KS X 1001 기본 한글 + 영문 + 숫자 + 특수문자
pyftsubset NotoSansKR-Regular.otf \
  --text-file=korean-business-chars.txt \
  --output-file=NotoSansKR-Subset.woff2 \
  --flavor=woff2
```

**예상 결과:** ~500-800KB (woff2)

### Font Loading Strategy
1. PDF 생성 버튼 클릭 시 폰트 lazy-load
2. `@react-pdf/renderer`의 `Font.register()` with async URL
3. 폰트를 CDN에 호스팅 (Cloudflare R2 or Supabase Storage)
4. 한번 로드 후 브라우저 캐싱

---

## 3. Recommended PDF Approach

### Option A: Client-side @react-pdf/renderer (Primary)
```
Flow:
1. User clicks "PDF 생성" button
2. Load Korean font subset (~500KB, cached after first load)
3. Render React PDF components with data
4. Generate PDF blob in browser
5. Open in new tab or download

Pros: No server cost, good DX, cached fonts
Cons: First-time font load (~500KB), client CPU usage
```

### Option B: Supabase Edge Function (Fallback)
```
Flow:
1. User clicks "PDF 생성" button
2. Call Supabase Edge Function with document ID
3. Edge Function fetches data + generates PDF with pdf-lib
4. Return PDF blob
5. Download in browser

Pros: Font stays on server, no client font load
Cons: Server cost, more complex deployment, Edge Function limits
```

### Option C: Browser Print API (Simplest)
```
Flow:
1. Create print-specific route: /po/:id/print
2. Styled HTML page with @media print CSS
3. User clicks "PDF 생성" → window.open('/po/:id/print')
4. User uses Ctrl+P / Cmd+P to save as PDF

Pros: Zero font overhead (uses system fonts), simplest implementation
Cons: Less control over layout, depends on user's browser/OS fonts
     User needs manual print-to-PDF step
```

### Recommendation
**Phase 9 구현 순서:**
1. **먼저 Option C** (Browser Print) - 빠른 구현, 검증
2. **이후 Option A** (@react-pdf/renderer) - 전문적인 PDF 생성
3. **필요 시 Option B** - 서버사이드 대체

---

## 4. Document Template Design

### Business Document Layout Pattern
```
┌─────────────────────────────────────────────┐
│  LOGO (optional)        Document Title       │
│                         Document No.         │
│                         Date                 │
├─────────────────────────────────────────────┤
│  Supplier/Shipper Info  │  Buyer/Consignee   │
│  Name, Address          │  Name, Address     │
│  Phone, Fax             │  Phone, Fax        │
├─────────────────────────────────────────────┤
│  Reference Info                              │
│  Ref No, Currency, Payment Term, etc.        │
├─────────────────────────────────────────────┤
│  Detail Table                                │
│  ┌──────┬────────┬─────┬───────┬──────────┐ │
│  │ No.  │Product │ Qty │ Price │  Amount  │ │
│  ├──────┼────────┼─────┼───────┼──────────┤ │
│  │  1   │ ...    │ ... │ ...   │   ...    │ │
│  ├──────┼────────┼─────┼───────┼──────────┤ │
│  │      │        │     │ Total │ XXX.XX   │ │
│  └──────┴────────┴─────┴───────┴──────────┘ │
├─────────────────────────────────────────────┤
│  Notes / Terms                               │
├─────────────────────────────────────────────┤
│  Signature Area              [Signature Img]  │
│  Name, Title                                 │
└─────────────────────────────────────────────┘
```

### Currency & Number Formatting
```
USD: $1,234.56
KRW: 1,234,567원
Weight: 1,197 KG
Length: 18,300 M
```

---

## 5. Tiptap Editor Analysis

### Required Extensions
| Extension | Purpose | Package |
|-----------|---------|---------|
| StarterKit | Basic formatting | @tiptap/starter-kit |
| Image | Inline images | @tiptap/extension-image |
| Link | Hyperlinks | @tiptap/extension-link |
| Placeholder | Empty state text | @tiptap/extension-placeholder |
| FileHandler | Drag & drop files | @tiptap-pro/extension-file-handler |
| Typography | Smart quotes, etc. | @tiptap/extension-typography |

### Image D&D Implementation
```
1. FileHandler extension config:
   - allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
   - onDrop: async (editor, files) => {
       for (const file of files) {
         const url = await uploadToSupabase(file, 'content-images');
         editor.chain().focus().setImage({ src: url }).run();
       }
     }

2. Paste handler: same flow for pasted images

3. Image resize: @tiptap/extension-image with resizable option
```

### Collaboration Consideration
- **Not recommended** for 5-10 users
- Tiptap collaboration requires Y.js + WebSocket server
- Overkill for this use case
- Simple last-write-wins with optimistic locking sufficient

---

## 6. TanStack Query + React Router 7 Integration

### When to Use What

| Scenario | Use |
|----------|-----|
| Initial page data (list, detail) | React Router Loader |
| Form submission (create, update, delete) | React Router Action |
| Client-side mutations with optimistic UI | TanStack Query mutation |
| Refetching after mutation | TanStack Query invalidation |
| Polling/real-time updates | TanStack Query refetchInterval |

### Practical Pattern
```
// In route module
export async function loader() {
  // SSR data loading
  return { initialData };
}

// In component
function Component() {
  const { initialData } = useLoaderData();

  // Use initialData as TanStack Query's initialData
  const { data } = useQuery({
    queryKey: ['po', 'list'],
    queryFn: fetchPOList,
    initialData,
  });

  // Mutations
  const updateStatus = useMutation({
    mutationFn: togglePOStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po'] });
    },
  });
}
```

### Cross-Module Cache Invalidation
```
// When customs is created, invalidate orders
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['customs'] });
  queryClient.invalidateQueries({ queryKey: ['orders'] });
}

// When shipping doc updated, invalidate orders
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['shipping'] });
  queryClient.invalidateQueries({ queryKey: ['orders'] });
}
```

### Alternative: React Router Only (Simpler)
TanStack Query 없이 React Router의 `useRevalidator` + `useFetcher`로도 구현 가능.
- `useFetcher` for mutations without navigation
- `useRevalidator` for manual refetching
- 더 간단하지만 optimistic updates, cache 관리가 제한적

**권장:** 초기에는 React Router only로 시작, 복잡해지면 TanStack Query 도입
