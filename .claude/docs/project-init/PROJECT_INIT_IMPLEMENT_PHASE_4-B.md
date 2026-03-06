# Phase 4-B: Tiptap Editor + Image Upload 구현 계획

**Date:** 2026-03-06
**Status:** 구현 중
**Reference:** `.claude/docs/PROJECT_INIT_BRAINSTORMING_PHASE_4.md`
**Depends on:** Phase 4-A (완료)

---

## 개요

Phase 4-B는 Tiptap 리치 텍스트 에디터와 이미지 드래그&드롭 업로드를 구현한다.
첨부파일/댓글 UI는 Phase 4-C에서 구현 예정.

---

## 에이전트 팀 구성

| 역할 | 담당 파일 |
|------|-----------|
| **Architect (Leader)** | 구현 계획 관리, 통합 검증 |
| **Frontend Dev** | `content-editor-toolbar.tsx`, `content-editor.tsx`, `content-section.tsx`, 라우트 수정 |
| **Backend Dev** | package.json (Tiptap 패키지), 서버 로더 통합 |

> Tester, Perf-analyzer, Code-reviewer, Security-reviewer — Phase 4-B는 순수 UI+통합 작업이므로 제외
> (Security는 Phase 4-A에서 이미 서버 업로드 보안 처리 완료)

---

## 파일 소유권 (File Ownership)

| 파일 | 담당 | 상태 |
|------|------|------|
| `package.json` | Backend Dev | - |
| `app/components/content/content-editor-toolbar.tsx` | Frontend Dev | - |
| `app/components/content/content-editor.tsx` | Frontend Dev | - |
| `app/components/content/content-section.tsx` | Frontend Dev | - |
| `app/loaders/po.$id.server.ts` | Backend Dev | - |
| `app/loaders/pi.$id.server.ts` | Backend Dev | - |
| `app/routes/_layout.po.$id.tsx` | Frontend Dev | - |
| `app/routes/_layout.pi.$id.tsx` | Frontend Dev | - |

---

## Task 목록

### Task B1: Tiptap 패키지 설치 ✅
- [x] `@tiptap/react` 설치
- [x] `@tiptap/starter-kit` 설치
- [x] `@tiptap/extension-image` 설치
- [x] `@tiptap/extension-link` 설치
- [x] `@tiptap/extension-placeholder` 설치
- [x] `@tiptap/pm` 설치

### Task B2: Pencil 디자인 드래프트 ✅
- [x] ContentSection (접이식 Card) 디자인 — saelim.pen x:6120, y:-36 (frame: rEKFB)
- [x] 에디터 툴바 디자인 (B/I/S/H2/H3/BL/OL/IMG 버튼)
- [x] 에디터 본문 + 저장 버튼 디자인

### Task B3: ContentEditorToolbar 컴포넌트 ✅
- [x] `app/components/content/content-editor-toolbar.tsx` 구현
- [x] 툴바 버튼: Bold, Italic, Strike
- [x] 툴바 버튼: H2, H3
- [x] 툴바 버튼: BulletList, OrderedList
- [x] 툴바 버튼: Blockquote, Code
- [x] 툴바 버튼: Image (이미지 삽입 — file input trigger)
- [x] 툴바 버튼: Undo, Redo
- [x] 모바일: 가로 스크롤, Undo/Redo 숨김 (hidden md:inline-flex)
- [x] 한국어 Tooltip 레이블 (TOOLBAR_LABELS 상수)

### Task B4: ContentEditor 컴포넌트 ✅
- [x] `app/components/content/content-editor.tsx` 구현
- [x] `useEditor` hook (immediatelyRender: false)
- [x] StarterKit 확장 (Bold, Italic, Strike, Code, Headings, Lists, History, codeBlock 비활성화)
- [x] Image 확장 (allowBase64: false)
- [x] Placeholder 확장 ("메모를 입력하세요...")
- [x] 이미지 D&D: `editorProps.handleDrop`
- [x] 이미지 붙여넣기: `editorProps.handlePaste`
- [x] 이미지 업로드 플로우: 임시 ObjectURL → POST /api/upload → PUT signed URL → 실제 publicUrl
- [x] 업로드 실패 시 이미지 노드 제거 + sonner toast 알림
- [x] ReadOnly 모드 지원 (editable prop)
- [x] 이미지 최대 10개 제한 (MAX_INLINE_IMAGES)
- [x] SVG 업로드 차단 (mime 타입 체크)

### Task B5: ContentSection 컴포넌트 ✅
- [x] `app/components/content/content-section.tsx` 구현
- [x] 접이식 Card (shadcn Collapsible)
- [x] 헤더: "메모 & 첨부파일" 제목 + 열림/닫힘 ChevronUp/Down 아이콘
- [x] 에디터 영역 (ContentEditor)
- [x] 저장 버튼 (fetcher.submit → _action: "content_save")
- [x] 에러 표시 (fetcher.data.error)
- [x] 변경사항 추적 (isDirty state)
- [x] 기본 상태: 메모 있으면 자동 열림

### Task B6: 서버 로더 통합 ✅
- [x] `app/loaders/po.$id.server.ts` — loader에 Promise.all에 loadContent("po") 추가
- [x] `app/loaders/po.$id.server.ts` — action에 content_ intent 처리 (handleContentAction)
- [x] `app/loaders/pi.$id.server.ts` — loader에 Promise.all에 loadContent("pi") 추가
- [x] `app/loaders/pi.$id.server.ts` — action에 content_ intent 처리 (handleContentAction)

### Task B7: 라우트 통합 ✅
- [x] `app/routes/_layout.po.$id.tsx` — `<ContentSection content={content} contentType="po" parentId={po.id}>` 추가
- [x] `app/routes/_layout.pi.$id.tsx` — `<ContentSection content={content} contentType="pi" parentId={pi.id}>` 추가

---

## 구현 세부사항

### Tiptap 설정

```typescript
const editor = useEditor({
  extensions: [
    StarterKit.configure({ codeBlock: false }), // code inline만 사용
    Image.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder: "메모를 입력하세요..." }),
  ],
  content: initialContent,
  immediatelyRender: false, // SSR 호환 필수
  editorProps: {
    handleDrop: imageDropHandler,
    handlePaste: imagePasteHandler,
  },
});
```

### 이미지 업로드 플로우

```
1. 드롭/붙여넣기로 이미지 파일 감지
2. ObjectURL로 임시 이미지 삽입 (opacity: 0.5)
3. POST /api/upload { bucket, fileName, contentType, documentType, parentId }
4. → signedUrl, publicUrl 수신
5. PUT signedUrl (raw file bytes)
6. 임시 이미지 src를 publicUrl로 교체 (opacity: 1)
7. 실패 시: 임시 이미지 제거 + toast.error("이미지 업로드 실패")
```

### ContentSection UX

```
[메모 & 첨부파일 ▼]          ← 접이식 헤더 (기본: 접힘)
┌─────────────────────────────┐
│  [B] [I] [U] [S] [H2] [H3] │  ← 툴바
│  [• ·] [1.] ["] [<>] [이미지] [↩][↪] │
├─────────────────────────────┤
│                             │
│  메모를 입력하세요...        │  ← 에디터 본문
│                             │
└─────────────────────────────┘
                    [저장]    ← 저장 버튼 (변경사항 있을 때 활성화)
```

### 서버 통합 패턴

```typescript
// po.$id.server.ts loader
const [{ data: po, error }, { data: pis }, { content }] = await Promise.all([
  supabase.from("purchase_orders").select(...).single(),
  supabase.from("proforma_invoices").select(...),
  loadContent(supabase, "po", idResult.data),
]);

// po.$id.server.ts action
const intent = formData.get("_action") as string;
if (intent?.startsWith("content_")) {
  return handleContentAction(supabase, user.id, "po", id, intent, formData, responseHeaders);
}
```

---

## 구현 완료 내용

### 신규 파일
- `app/components/content/content-editor-toolbar.tsx` — 툴바 컴포넌트 (lucide 아이콘, 한국어 Tooltip)
- `app/components/content/content-editor.tsx` — Tiptap 에디터 + 이미지 업로드 (D&D/붙여넣기/버튼)
- `app/components/content/content-section.tsx` — 접이식 Card 래퍼 (Collapsible, 수동 저장)

### 수정 파일
- `package.json` — @tiptap/{react,starter-kit,extension-image,extension-link,extension-placeholder,pm} 추가
- `app/loaders/po.$id.server.ts` — loadContent("po") + handleContentAction("po") 통합
- `app/loaders/pi.$id.server.ts` — loadContent("pi") + handleContentAction("pi") 통합
- `app/routes/_layout.po.$id.tsx` — ContentSection 컴포넌트 추가 (연결된 PI 목록 아래)
- `app/routes/_layout.pi.$id.tsx` — ContentSection 컴포넌트 추가 (비고 카드 아래)

### Pencil 디자인
- saelim.pen: "Content Section (4-B)" 프레임 (x:6120, y:-36, nodeId: rEKFB)
  - 편집 상태: 툴바 + 에디터 본문 + 저장 버튼
  - 읽기 상태: 헤더 + "메모 있음" 배지 (접힘)

### typecheck 결과
- 오류 없음 (2개 null 가드 수정 후 통과)

---

## 참고 사항

- Phase 4-B 범위: 에디터 + 이미지 업로드만 (첨부파일/댓글은 Phase 4-C)
- Tiptap 번들 크기 (~200KB gzip): dynamic import로 lazy load 적용
- 이미지 최대 10개 제한 (에디터 내 카운트 체크)
- `immediatelyRender: false` 필수 (CF Workers SSR 환경)
- 이미지 public URL은 content-images 버킷 (public) — 서버 프록시 불필요
