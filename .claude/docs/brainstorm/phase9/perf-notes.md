# Phase 9: PDF Generation - Performance Analyzer Notes (v2)

**Updated:** 2026-03-06
**Status:** Implementation-Ready Analysis
**Scope:** Bundle isolation, runtime performance, lazy loading, memory management

---

## 1. Critical Issues (Must Fix)

### 1.1 [BUNDLE] @react-pdf/renderer must not enter CF Workers server bundle

**Impact:** yoga-layout WASM in server bundle → "Wasm code generation disallowed by embedder" → complete app failure.

**Required `vite.config.ts` changes:**

```typescript
ssr: {
  noExternal: ["@react-pdf/renderer"],
},
optimizeDeps: {
  exclude: ["@react-pdf/renderer"],
},
```

- `exclude`: prevents Vite dev-server pre-bundler from eagerly evaluating WASM
- `noExternal`: ensures ESM processing and Rollup tree-shaking

**Effort:** Low (2-line addition)

### 1.2 [BUNDLE] Static import of lazy target breaks isolation

**Impact:** If any route file statically imports `@react-pdf/renderer`, the entire dependency tree enters the server bundle.

**Prevention:** PDF files must only be imported via dynamic `import()` in click handlers.

**Verification:**
```bash
grep -r "yoga\|react-pdf" dist/_worker.js | head -5
# Should return nothing
```

---

## 2. Bundle Size Analysis

### 2.1 Current Project
- SSR bundle: ~500-600 KB gzip
- Client initial: similar range

### 2.2 @react-pdf/renderer Impact

| Bundle | Impact |
|--------|--------|
| SSR (server) | **+0 KB** (lazy boundary enforces isolation) |
| Client initial | **+0 KB** (lazy chunk not in initial) |
| Client PDF lazy chunk | **~900 KB gzip** (once per session) |
| Font files | **0 KB** (Helvetica built-in) |

### 2.3 Dependency Tree
```
@react-pdf/renderer (~900KB gzip)
  +-- @react-pdf/layout -> yoga-layout (WASM, ~350KB)
  +-- @react-pdf/pdfkit (~200KB)
  +-- @react-pdf/textkit
  +-- @react-pdf/primitives
  +-- react (peer, shared)
```

---

## 3. Lazy Loading Optimization

### 3.1 Existing ContentEditor Pattern (Reference)

From `app/components/content/content-section.tsx`:
```typescript
const ContentEditor = React.lazy(() =>
  import("./content-editor").then((m) => ({ default: m.ContentEditor }))
);
```

PDF uses imperative approach (click handler, not rendered component):
```typescript
async function handleDownload() {
  const [{ pdf }, { PODocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("~/components/pdf/po-document"),
  ]);
  const blob = await pdf(<PODocument data={po} />).toBlob();
  // ...
}
```

### 3.2 Prefetch Strategy (Optional)

```typescript
useEffect(() => {
  import("@react-pdf/renderer").catch(() => {});
}, []);
```

| Metric | Without Prefetch | With Prefetch |
|--------|-----------------|---------------|
| First-click latency | 600-1600ms | 100-400ms |
| Bandwidth cost | 0 | ~900KB |
| Recommendation | Default | Consider for B2B internal tool |

### 3.3 SSR/CF Workers Compatibility

- Dynamic `import()` in click handler: never runs on server
- No `typeof window !== 'undefined'` guard needed
- Vite/Rollup code-splits dynamic imports automatically
- SSR renders fallback button, client loads on demand

---

## 4. Runtime Performance

### 4.1 Per-Document Estimates

| Document | Rows | Generation | Main Thread Block |
|----------|------|-----------|-------------------|
| PO | 1-5 | 100-300ms | Minimal |
| PI | 1-5 | 100-300ms | Minimal |
| CI | 1-5 | 150-400ms | Minimal |
| PL | 1-5 | 150-400ms | Minimal |
| SL (small) | 20-50 | 300-600ms | Noticeable |
| SL (large) | 100-200+ | 500-2000ms | **Significant** |
| Invoice | 4 | 100-200ms | Minimal |

### 4.2 Device Performance

| Device | First Click | Subsequent |
|--------|-----------|------------|
| Desktop (modern) | 700-1500ms | 200-500ms |
| Mobile (high-end) | 800-2000ms | 300-800ms |
| Mobile (mid-range) | 1000-3000ms | 400-1200ms |

### 4.3 SL Large Table Mitigation

`pdf().toBlob()` runs yoga-layout synchronously. For 200+ row SL:
- **Current:** Ship with main-thread + "생성 중..." loading indicator
- **Future:** Web Worker for SL-only (medium effort, only if real-world issue)

---

## 5. Memory Management

### 5.1 Blob Lifecycle (Correct Sequence)

```typescript
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = filename;
document.body.appendChild(a);  // Firefox compatibility
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);      // AFTER click
```

**Critical:** `revokeObjectURL` must come AFTER `click()`. Revoking before produces empty download.

### 5.2 Blob Size Estimates

| Document | Pages | Blob Size |
|----------|-------|-----------|
| PO/PI | 1 | 30-60 KB |
| CI/PL | 1-2 | 40-80 KB |
| SL (small) | 1-3 | 50-100 KB |
| SL (large) | 5-10 | 100-300 KB |
| Invoice | 1 | 30-50 KB |

### 5.3 Repeat Click Caching (Optional)

```typescript
const [cachedBlob, setCachedBlob] = useState<{blob: Blob; key: string} | null>(null);
const cacheKey = `${docType}-${data.updated_at}`;
if (cachedBlob?.key === cacheKey) {
  triggerDownload(cachedBlob.blob, filename);
  return;
}
```

Saves 200-800ms on repeat clicks. Memory: ~50-200 KB per tab.

---

## 6. Required Configuration Changes

### 6.1 package.json
```json
{ "dependencies": { "@react-pdf/renderer": "^4.3.2" } }
```

### 6.2 vite.config.ts
```typescript
ssr: { noExternal: ["@react-pdf/renderer"] },
optimizeDeps: { exclude: ["@react-pdf/renderer"] },
```

### 6.3 Post-Build Verification
```bash
grep -r "yoga\|react-pdf" dist/_worker.js | head -5
# Should return nothing
```

---

## 7. Caching Strategy (Future Server-Side)

### 7.1 KV Caching
```typescript
const cacheKey = `pdf:ci:${id}:${Math.floor(new Date(updatedAt).getTime() / 1000)}`;
```
- No explicit cache invalidation needed (key changes with updated_at)
- Trade documents rarely change after finalization -> high cache hit rate

### 7.2 R2 Archival (Optional)
- Path: `pdfs/ci/{org_id}/{id}/{generated_at}.pdf`
- For audit trail / email attachments
- $0.015/GB/month, no egress fees within CF

---

## 8. Recommendations Summary

| Priority | Action | Effort |
|----------|--------|--------|
| **Must** | Add vite.config.ts SSR exclusion | Low |
| **Must** | Verify server bundle post-build | Low |
| **Should** | Loading indicator with "생성 중..." text | Low |
| **Could** | Prefetch on detail page mount | Low |
| **Could** | Blob cache for repeat clicks | Low |
| **Won't** | Web Worker for SL (defer unless needed) | Medium |

### Already Well-Optimized
- Server memory/CPU: 0 impact (client-side PDF)
- Data loading: 0 new queries (existing loaderData)
- Font: 0 KB (Helvetica built-in, All-English)
- SSR: Suspense fallback renders disabled button correctly

---

## Sources

- [Yoga in CF Workers 2025](https://pmil.me/en/posts/yoga-in-cloudflare-workers)
- [CF Workers WASM Docs](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
- [react-pdf CF Workers Issue #2757](https://github.com/diegomura/react-pdf/issues/2757)
- [CF Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [pdf-lib GitHub](https://github.com/Hopding/pdf-lib)
- [PDF Libraries Comparison 2025](https://joyfill.io/blog/comparing-open-source-pdf-libraries-2025-edition)
