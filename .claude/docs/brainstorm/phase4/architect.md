# Phase 4: Contents System - Architect Notes

**Date:** 2026-03-06
**Role:** Architect

---

## 1. Architecture Overview

The Contents System is a **polymorphic, module-agnostic subsystem** that attaches rich text notes, images, file attachments, and threaded comments to any document in the system (PO, PI, Shipping, Order, Customs).

### Integration Model

```
┌─────────────────────────────────────────────────────┐
│  Document Detail Page (e.g., PO Detail)              │
│  ┌───────────────┐  ┌───────────────┐               │
│  │ PODetailInfo   │  │ PODetailItems │               │
│  └───────────────┘  └───────────────┘               │
│  ┌─────────────────────────────────────────────────┐ │
│  │ ContentSection (shared component)                │ │
│  │  ┌──────────────────────────────────┐           │ │
│  │  │ Tiptap Editor (body JSONB)       │           │ │
│  │  │  - Rich text formatting          │           │ │
│  │  │  - Inline images (drag & drop)   │           │ │
│  │  └──────────────────────────────────┘           │ │
│  │  ┌──────────────────────────────────┐           │ │
│  │  │ File Attachments List            │           │ │
│  │  │  - Upload / Download / Delete    │           │ │
│  │  └──────────────────────────────────┘           │ │
│  │  ┌──────────────────────────────────┐           │ │
│  │  │ Comments Thread                  │           │ │
│  │  │  - Add / Edit / Delete           │           │ │
│  │  └──────────────────────────────────┘           │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Key Principle:** The content system is a **shared component + shared server utilities**, NOT a separate route module. Content is embedded inside each document's detail page and managed through the existing detail page's action handler.

---

## 2. DB Schema Refinements

### 2.1 Decision: 1:1 Contents per Document (Not 1:N)

**Recommendation: 1:1 relationship** - Each document has exactly one content record.

**Rationale:**
- Business reality: A PO has one set of notes, not multiple. Users don't create "multiple notes" for a single PO.
- 1:N creates UX complexity (which note am I editing? ordering? titling?) with no real benefit.
- The `title` field from the brainstormed schema becomes unnecessary with 1:1.
- Comments provide the "multiple entries" pattern for discussion threads.
- Attachments provide the "multiple files" pattern.

**Schema change:** Remove `title` column. Content is auto-created (or lazily created) when a user first edits the content section.

### 2.2 Revised Schema

```sql
-- ══════════════════════════════════════════════════════
-- Contents (Polymorphic, 1:1 per document)
-- ══════════════════════════════════════════════════════
CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Polymorphic reference
  content_type TEXT NOT NULL CHECK (content_type IN ('po', 'pi', 'shipping', 'order', 'customs')),
  parent_id UUID NOT NULL,
  -- Tiptap JSON content
  body JSONB,
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  -- Enforce 1:1: one content per (content_type, parent_id)
  CONSTRAINT uq_content_parent UNIQUE (content_type, parent_id)
);

-- Primary lookup pattern
CREATE INDEX idx_contents_type_parent ON contents (content_type, parent_id) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════
-- Content Attachments (1:N per content)
-- ══════════════════════════════════════════════════════
CREATE TABLE content_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  -- Storage metadata
  storage_path TEXT NOT NULL,    -- Supabase Storage path (not full URL)
  file_name TEXT NOT NULL,       -- Original filename for display
  file_size INT,                 -- Bytes
  mime_type TEXT,                -- e.g., "application/pdf", "image/png"
  -- Audit
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_content_attachments_content ON content_attachments (content_id) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════
-- Comments (1:N per content, flat - not nested)
-- ══════════════════════════════════════════════════════
CREATE TABLE content_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_content_comments_content ON content_comments (content_id) WHERE deleted_at IS NULL;
```

### 2.3 Key Schema Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 1:1 vs 1:N | 1:1 (UNIQUE constraint) | Simpler UX, matches business reality |
| `title` column | Removed | Unnecessary with 1:1; context comes from parent document |
| `deleted_at` on contents | Yes | Consistent with project soft-delete pattern |
| `deleted_at` on attachments | Yes | Allow soft-delete individual files |
| `deleted_at` on comments | Yes | Allow soft-delete individual comments |
| Column name `type` vs `content_type` | `content_type` | Avoid confusion with reserved word / org `type` column |
| `file_url` vs `storage_path` | `storage_path` | Store relative path, generate signed URL server-side |
| `updated_by` on contents | Yes | Track who last edited (not just created) |
| Comments nesting | Flat (no `parent_comment_id`) | Overkill for internal trade docs; flat list sufficient |
| Comments on contents vs documents | On contents | Contents already has the polymorphic lookup; no need to duplicate |
| Inline image references | Not tracked in DB | Images referenced in Tiptap JSON body; orphan cleanup via Storage lifecycle rules |
| `mime_type` on attachments | Yes | Enables file type icons and preview hints in UI |

### 2.4 RLS Policies

```sql
-- Contents: GV full CRUD, Saelim no access
CREATE POLICY contents_gv_all ON contents
  FOR ALL USING (
    (SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type') = 'gv')
  );

-- Content Attachments: Same as contents
CREATE POLICY content_attachments_gv_all ON content_attachments
  FOR ALL USING (
    (SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type') = 'gv')
  );

-- Content Comments: Same as contents
CREATE POLICY content_comments_gv_all ON content_comments
  FOR ALL USING (
    (SELECT (auth.jwt() -> 'app_metadata' ->> 'org_type') = 'gv')
  );
```

Saelim users have no access to contents, attachments, or comments. Contents are GV internal working notes. If Saelim needs to see delivery-related notes in the future, a separate `delivery_notes` column on `deliveries` is cleaner than granting content access.

---

## 3. Data Flow

### 3.1 Content Lifecycle

```
Document Created (PO/PI)
  └── No content record yet (lazy creation)

User opens Detail Page
  └── Loader: SELECT contents WHERE content_type='po' AND parent_id=:id
  └── If no record: show empty editor placeholder

User types in editor / uploads image
  └── Action: UPSERT contents (INSERT or UPDATE)
  └── Tiptap JSON body saved to contents.body

User uploads file attachment
  └── Action 1: Upload file to Supabase Storage (content-attachments bucket)
  └── Action 2: INSERT content_attachments (auto-creates content if needed)

User adds comment
  └── Action: INSERT content_comments (auto-creates content if needed)

Document soft-deleted
  └── Content is NOT cascade-deleted (soft delete on parent only)
  └── Content becomes orphaned but invisible (parent detail page inaccessible)
  └── Optional: periodic cleanup job (not needed now)
```

### 3.2 Lazy Content Creation

Instead of creating a `contents` row when a PO is created, we create it **on first save** of the content section. This avoids empty content records for documents where notes are never added.

**Upsert pattern:**
```sql
INSERT INTO contents (content_type, parent_id, body, created_by, updated_by)
VALUES ('po', :parent_id, :body, :user_id, :user_id)
ON CONFLICT (content_type, parent_id) DO UPDATE SET
  body = :body,
  updated_by = :user_id,
  updated_at = NOW();
```

### 3.3 Image Upload Flow

```
User drags image into Tiptap editor
  └── Client: File picked up by Tiptap drop handler
  └── Client: POST to current route action with _action="upload_image"
  └── Server: Upload to Supabase Storage "content-images" bucket
  └── Server: Return public URL
  └── Client: Insert <img src="public_url"> into Tiptap document
  └── Client: Image URL stored in Tiptap JSON body (not in content_attachments)
```

**Why public bucket for images:** Inline images in Tiptap JSON need directly accessible URLs. Signed URLs would expire and break rendered content. Content images are internal (GV only), and the bucket path includes random UUIDs making URLs unguessable. This is an acceptable trade-off for an internal system.

### 3.4 File Attachment Flow

```
User clicks "Attach File" or drags file to attachment zone
  └── Client: POST to current route action with _action="upload_attachment"
  └── Server: Ensure content record exists (upsert with empty body if needed)
  └── Server: Upload to Supabase Storage "content-attachments" bucket (private)
  └── Server: INSERT content_attachments row
  └── Server: Return updated attachment list
  └── Client: Revalidation shows new file in list

User downloads attachment
  └── Client: Request to action with _action="download_attachment" + attachment_id
  └── Server: Generate signed URL (60s expiry) from storage_path
  └── Server: Return signed URL
  └── Client: Open URL in new tab / trigger download

User deletes attachment
  └── Client: POST _action="delete_attachment" + attachment_id
  └── Server: Soft delete content_attachments row
  └── Server: Delete from Supabase Storage
  └── Client: Revalidation removes file from list
```

---

## 4. API/Loader Architecture

### 4.1 Decision: Contents Embedded in Each Detail Page (Option B)

**Rejected: Option A (Separate content route)**
- Would require a new route like `/contents/:type/:parentId`
- Breaks the mental model: content belongs to a document, not as standalone page
- Adds routing complexity with no benefit
- Would need cross-route data sharing or separate fetcher loads

**Chosen: Option B (Embedded in detail page)**
- Content section is a `<Card>` inside PO/PI detail pages, below the existing cards
- Content data loaded in the same loader (parallel query)
- Content actions handled in the same action handler (via `_action` intents)

**Rationale:**
- Matches existing pattern: PO detail already loads PO data + connected PIs in one loader
- No new routes needed
- Natural UX: scroll down on detail page to see notes/attachments/comments
- Action intents (`_action: "save_content"`, `_action: "upload_attachment"`, etc.) fit the established multi-intent pattern

### 4.2 Shared Server Utilities

Instead of duplicating content queries in every module loader, create shared utility functions.

**File: `app/lib/content.server.ts`**

```typescript
// Shared content query utilities (NOT a loader - called from module loaders)

export async function loadContent(
  supabase: SupabaseClient,
  contentType: ContentType,
  parentId: string
) {
  const [{ data: content }, { data: attachments }, { data: comments }] =
    await Promise.all([
      supabase
        .from("contents")
        .select("id, body, updated_by, updated_at")
        .eq("content_type", contentType)
        .eq("parent_id", parentId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("content_attachments")
        .select("id, file_name, file_size, mime_type, uploaded_by, created_at")
        .eq("content_id", /* subquery or join */)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("content_comments")
        .select("id, body, created_by, created_at, updated_at")
        .eq("content_id", /* subquery or join */)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);

  return { content, attachments: attachments ?? [], comments: comments ?? [] };
}

export async function handleContentAction(
  supabase: SupabaseClient,
  userId: string,
  contentType: ContentType,
  parentId: string,
  intent: string,
  formData: FormData
): Promise<ActionResult> {
  // Dispatches to save_content, upload_image, upload_attachment,
  // delete_attachment, add_comment, delete_comment
}
```

### 4.3 Integration Pattern in Module Loaders

**PO detail loader (modified):**

```typescript
// app/loaders/po.$id.server.ts

import { loadContent } from "~/lib/content.server";

export async function loader({ request, context, params }: DetailLoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);
  // ... existing id validation ...

  const [
    { data: po, error },
    { data: pis },
    contentData
  ] = await Promise.all([
    // existing PO query
    supabase.from("purchase_orders").select(/*...*/).eq("id", id).single(),
    // existing PI query
    supabase.from("proforma_invoices").select(/*...*/).eq("po_id", id),
    // NEW: content query
    loadContent(supabase, "po", id),
  ]);

  return data({ po, pis: pis ?? [], ...contentData }, { headers: responseHeaders });
}
```

**PO detail action (modified):**

```typescript
export async function action({ request, context, params }: DetailLoaderArgs) {
  // ... existing auth + id validation ...
  const intent = formData.get("_action") as string;

  // Content-related intents
  if (intent.startsWith("content_")) {
    return handleContentAction(supabase, user.id, "po", id, intent, formData);
  }

  // ... existing update/delete/clone/toggle_status handlers ...
}
```

### 4.4 Attachment Query Challenge

Attachments and comments reference `content_id`, but the content record may not exist yet (lazy creation). Two approaches:

**Approach A: Two-step query (simpler)**
1. Query content by `(content_type, parent_id)`
2. If content exists, query attachments and comments by `content_id`
3. If no content, return empty arrays

**Approach B: Join through contents table**
```sql
SELECT ca.* FROM content_attachments ca
JOIN contents c ON c.id = ca.content_id
WHERE c.content_type = 'po' AND c.parent_id = :id
AND c.deleted_at IS NULL AND ca.deleted_at IS NULL;
```

**Decision: Approach A (two-step).** It is simpler, avoids join complexity in Supabase JS client, and content record existence is a useful signal for the UI (show/hide editor). The additional round trip is negligible since it only runs when content exists.

---

## 5. File Storage Architecture

### 5.1 Bucket Design

| Bucket | Access | Max Size | Types | Path Pattern |
|--------|--------|----------|-------|-------------|
| `content-images` | Public | 5 MB | `image/*` | `{content_type}/{parent_id}/{uuid}.{ext}` |
| `content-attachments` | Private (RLS) | 20 MB | Any | `{content_type}/{parent_id}/{uuid}_{filename}` |

### 5.2 Storage Path Convention

```
content-images/
  po/{parent_uuid}/{image_uuid}.png
  pi/{parent_uuid}/{image_uuid}.jpg

content-attachments/
  po/{parent_uuid}/{file_uuid}_original-filename.pdf
  pi/{parent_uuid}/{file_uuid}_invoice-scan.xlsx
```

**Why include `content_type/parent_id` in path:**
- Organizes files by document for easy browsing in Supabase dashboard
- Enables bulk deletion of all files for a document if needed
- Makes paths self-documenting

### 5.3 Upload Flow (Server-Side)

All uploads go through server actions, not client-side direct uploads. This ensures:
- Auth validation (requireGVUser) on every upload
- File type/size validation on the server
- Consistent storage path generation
- No need to expose Supabase Storage credentials to client

```typescript
// In action handler
const file = formData.get("file") as File;
if (!file || file.size === 0) return error;
if (file.size > 5 * 1024 * 1024) return error; // 5MB for images

const ext = file.name.split(".").pop() ?? "bin";
const storagePath = `${contentType}/${parentId}/${crypto.randomUUID()}.${ext}`;

const { error: uploadError } = await supabase.storage
  .from("content-images")
  .upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
```

### 5.4 Cloudflare Workers Consideration

Cloudflare Workers has a **128MB memory limit** and **request body size limits**. For file uploads:
- Default max request body: 100MB (sufficient for 20MB files)
- Files are streamed, not fully buffered (Supabase SDK handles this)
- For large files, consider Supabase Storage's `createSignedUploadUrl` pattern (client uploads directly to Storage with a server-generated signed URL)

**Decision for Phase 4:** Use server-side uploads. Our max file is 20MB, well within Workers limits. If performance becomes an issue, switch to signed upload URLs in a later phase.

---

## 6. Component Architecture

### 6.1 Component Tree

```
app/components/content/
  content-section.tsx        # Main wrapper (Card) that contains all sub-sections
  content-editor.tsx         # Tiptap editor with toolbar
  content-attachments.tsx    # File attachment list + upload
  content-comments.tsx       # Comment thread
  content-editor-toolbar.tsx # Tiptap toolbar (bold/italic/headings/image)
```

### 6.2 Component Responsibilities

**`ContentSection`** (main orchestrator)
- Receives `contentType`, `parentId`, `content`, `attachments`, `comments` as props
- Renders editor, attachments, and comments as collapsible Card sections
- Manages save state (dirty/clean indicator)
- Uses `useFetcher()` for all content actions (independent of page navigation)

**`ContentEditor`** (Tiptap wrapper)
- Wraps `@tiptap/react` `useEditor` hook
- Extensions: StarterKit, Image, Placeholder, Underline
- Image drag-and-drop: Custom drop handler that uploads via fetcher, then inserts URL
- Auto-save debounce: Save content 2s after last keystroke (via fetcher)
- Read mode vs edit mode toggle
- Output: Tiptap JSON (not HTML) stored in `contents.body`

**`ContentAttachments`** (file list)
- File upload: `<input type="file">` + fetcher submit with `encType: "multipart/form-data"`
- Display: List with file icon, name, size, date, download/delete actions
- Download: fetcher action to get signed URL, then `window.open()`
- Drag-and-drop zone for file upload

**`ContentComments`** (thread)
- Simple text input + submit
- List of comments with author, date, body
- Edit own comment (inline edit)
- Delete own comment (soft delete via fetcher)

### 6.3 Tiptap Package Selection

```
@tiptap/react           # React bindings
@tiptap/pm              # ProseMirror dependencies
@tiptap/starter-kit     # Bold, Italic, Strike, Code, Headings, Lists, etc.
@tiptap/extension-image # Image node
@tiptap/extension-placeholder  # Empty editor placeholder text
@tiptap/extension-underline    # Underline formatting
```

**Excluded (for now):**
- `@tiptap/extension-collaboration` - No real-time collab needed
- `@tiptap/extension-table` - Overkill for notes
- `@tiptap/extension-file-handler` - Custom drop handler is simpler for our use case
- `@tiptap/extension-link` - Can add later if needed

### 6.4 Tiptap JSON Storage

Tiptap outputs a ProseMirror JSON document. Example:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "CHP에서 " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "50톤" },
        { "type": "text", "text": " 추가 발주 예정." }
      ]
    },
    {
      "type": "image",
      "attrs": {
        "src": "https://xxx.supabase.co/storage/v1/object/public/content-images/po/uuid/img.png"
      }
    }
  ]
}
```

Stored as JSONB in `contents.body`. Rendered back to Tiptap on load. No HTML conversion needed.

---

## 7. Implementation Sub-phases

### Phase 4-A: DB Migration + Storage Setup + Content CRUD Server Layer
**Effort: Small**

**Deliverables:**
1. Supabase migration: `contents`, `content_attachments`, `content_comments` tables + indexes + RLS
2. Supabase Storage: Create `content-images` (public) and `content-attachments` (private) buckets + policies
3. `app/types/content.ts` - ContentType, Content, ContentAttachment, ContentComment types
4. `app/lib/content.server.ts` - `loadContent()`, `handleContentAction()` shared utilities
5. Zod validation schemas for content actions

**Dependencies:** None (pure backend/DB work)

### Phase 4-B: Tiptap Editor Integration + Image Upload
**Effort: Medium**

**Deliverables:**
1. Install Tiptap packages (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-placeholder`, `@tiptap/extension-underline`)
2. `app/components/content/content-editor.tsx` - Tiptap editor component
3. `app/components/content/content-editor-toolbar.tsx` - Formatting toolbar
4. `app/components/content/content-section.tsx` - Main wrapper (editor only, no attachments/comments yet)
5. Image upload action handler in `content.server.ts`
6. Image drag-and-drop in editor
7. Auto-save with debounce

**Dependencies:** Phase 4-A

### Phase 4-C: File Attachments + Comments
**Effort: Medium**

**Deliverables:**
1. `app/components/content/content-attachments.tsx` - Upload, list, download, delete
2. `app/components/content/content-comments.tsx` - Add, list, edit, delete
3. Attachment upload/download/delete action handlers
4. Comment CRUD action handlers
5. Signed URL generation for private attachment downloads

**Dependencies:** Phase 4-A, 4-B (ContentSection wrapper exists)

### Phase 4-D: Integration with PO/PI Detail Pages
**Effort: Small**

**Deliverables:**
1. Modify `app/loaders/po.$id.server.ts` - Add `loadContent()` to loader, content intents to action
2. Modify `app/routes/_layout.po.$id.tsx` - Add `<ContentSection>` below existing cards
3. Modify `app/loaders/pi.$id.server.ts` - Same as PO
4. Modify `app/routes/_layout.pi.$id.tsx` - Same as PO
5. Test full flow: create PO -> add notes -> upload image -> attach file -> comment

**Dependencies:** Phase 4-B, 4-C

---

## 8. Cross-module Integration

### 8.1 Adding ContentSection to a Detail Page

The integration is deliberately minimal. For each module (PO, PI, Shipping, etc.):

**Loader change (3 lines):**
```typescript
import { loadContent } from "~/lib/content.server";

// In Promise.all, add:
loadContent(supabase, "po", idResult.data),

// In return, spread content data:
return data({ po, pis: pis ?? [], ...contentData }, { headers: responseHeaders });
```

**Action change (4 lines):**
```typescript
import { handleContentAction } from "~/lib/content.server";

// Before existing intent handlers:
if (intent.startsWith("content_")) {
  return handleContentAction(supabase, user.id, "po", id, intent, formData, responseHeaders);
}
```

**Route change (1 component):**
```tsx
import { ContentSection } from "~/components/content/content-section";

// Inside PageContainer, after existing cards:
<ContentSection
  contentType="po"
  parentId={po.id}
  content={content}
  attachments={attachments}
  comments={comments}
/>
```

### 8.2 Future Modules

When Shipping, Orders, Customs modules are built in Phase 5-7, adding content support requires the same 3 modifications above. The content system is fully decoupled from specific document types.

### 8.3 Content on Document Delete

When a PO/PI is soft-deleted, we do NOT cascade soft-delete the content. Reasons:
- Content is invisible anyway (detail page is inaccessible for deleted documents)
- If we ever implement "restore deleted document", content is preserved
- No orphan problem because content has no independent access path
- Simpler code (no additional delete logic per module)

---

## 9. Open Questions & Decisions

### 9.1 Resolved Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | 1:1 or 1:N contents per document? | **1:1** (UNIQUE constraint) | Matches business reality, simpler UX |
| 2 | Lazy or eager content creation? | **Lazy** (on first save) | Avoids empty records for docs without notes |
| 3 | HTML or JSON storage? | **Tiptap JSON** (JSONB) | Native Tiptap format, no conversion needed, queryable |
| 4 | Auto-save or manual save? | **Auto-save (debounced 2s)** | Better UX, no "forgot to save" risk |
| 5 | Comments flat or threaded? | **Flat** | Internal trade docs, threading is overkill |
| 6 | Image storage: public or private? | **Public bucket** | Inline images need direct URLs; internal system, UUID paths |
| 7 | Upload method: server-side or signed URL? | **Server-side** | Auth guaranteed, simpler, within Workers limits |
| 8 | Content route: separate or embedded? | **Embedded** in detail pages | Follows existing pattern, natural UX |
| 9 | Cascade delete on document delete? | **No** | Content is invisible anyway, preserves for restore |

### 9.2 Open Questions for Team Discussion

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should editor be always visible or collapsible? | (A) Always visible card, (B) Collapsible accordion | (B) Collapsible - most documents won't have notes, reduce visual noise |
| 2 | Should we show "last edited by" on content? | Yes/No | Yes - useful for team accountability, already tracked with `updated_by` |
| 3 | Max inline images per content? | Unlimited / 10 / 20 | 10 - prevents abuse, each is up to 5MB |
| 4 | Should comments show user names? | UUID only / Name from user_profiles | Name - fetch from user_profiles JOIN or app_metadata |
| 5 | Do we need content on the CREATE page (new PO form)? | Yes/No | No - content is for working notes on existing documents, not creation-time |
| 6 | Editor placeholder text? | Various | "메모를 입력하세요..." (Korean: "Enter a note...") |
| 7 | File type restrictions for attachments? | Block executables / Allow all | Block `.exe`, `.bat`, `.sh`, `.cmd` - minimal security |

### 9.3 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tiptap bundle size (~200KB gzipped) | Increased initial load | Lazy load editor component (dynamic import) |
| Image storage costs | Growing storage use | 5MB limit + 10 images/content cap + lifecycle rules |
| Large Tiptap JSON in JSONB | Slow queries | Content is separate table, not in main document query path |
| Cloudflare Workers memory with file uploads | OOM on large files | 20MB max, well within 128MB limit |
| Tiptap SSR compatibility | Hydration mismatch | Render editor client-only with `ClientOnly` wrapper or `useEffect` guard |
| Stale content on concurrent edits | Data loss | Last-write-wins acceptable for internal 2-3 user system |

### 9.4 Tiptap SSR Note

Tiptap is a client-side editor (ProseMirror-based). In our SSR React Router setup:
- **Server render:** Show content as read-only HTML (or just the JSON preview)
- **Client hydration:** Initialize Tiptap editor with the JSON content
- Use a `useEffect` or `typeof window !== "undefined"` guard to prevent SSR issues
- Alternatively, wrap with a `ClientOnly` component that renders a placeholder during SSR

This is a known pattern with Tiptap + SSR frameworks and not a blocking concern.

---

## 10. File Structure Summary

### New Files

```
app/types/content.ts                           # Types
app/lib/content.server.ts                      # Shared server utilities
app/components/content/content-section.tsx      # Main wrapper
app/components/content/content-editor.tsx       # Tiptap editor
app/components/content/content-editor-toolbar.tsx  # Editor toolbar
app/components/content/content-attachments.tsx  # File attachment list
app/components/content/content-comments.tsx     # Comment thread
```

### Modified Files

```
app/loaders/po.$id.server.ts     # Add loadContent + content action intents
app/loaders/pi.$id.server.ts     # Add loadContent + content action intents
app/routes/_layout.po.$id.tsx    # Add ContentSection component
app/routes/_layout.pi.$id.tsx    # Add ContentSection component
package.json                      # Add @tiptap/* packages
```

### No New Routes

The content system does not add any new routes to `routes.ts`. All content operations happen within existing detail page routes.

---

## 11. Trade-offs Summary

| What we chose | What we gave up | Why it's acceptable |
|---------------|----------------|---------------------|
| 1:1 content per document | Multiple notes per document | Business doesn't need it; comments provide multi-entry |
| Lazy content creation | Guaranteed content row for every document | Avoids thousands of empty rows |
| Public bucket for images | Perfect image access control | Internal system, UUID paths, unguessable |
| Server-side uploads | Direct-to-storage uploads (faster for user) | Auth guaranteed, simpler implementation |
| Flat comments | Threaded discussions | 2-3 GV users, threading is unnecessary complexity |
| Auto-save (debounce) | Explicit save button | Better UX for notes; no "lost work" risk |
| Last-write-wins | Conflict resolution | 2-3 concurrent users max, acceptable risk |
| Client-only Tiptap | SSR-rendered rich text | Editor is interactive by nature; SSR adds complexity |
