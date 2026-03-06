import { z } from "zod";

// ── 콘텐츠 저장 ────────────────────────────────────────────
// body: Tiptap JSON string (서버에서 JSON.parse)
export const contentSaveSchema = z.object({
  body: z
    .string()
    .max(500_000, "본문이 너무 깁니다 (최대 500KB)")
    .optional()
    .default(""),
});

// ── 콘텐츠 삭제 ────────────────────────────────────────────
export const contentDeleteSchema = z.object({
  content_id: z.string().uuid("유효한 콘텐츠 ID가 필요합니다"),
});

// ── 댓글 생성 ──────────────────────────────────────────────
// content_id는 서버에서 ensureContentExists로 처리 (클라이언트 불필요)
export const commentCreateSchema = z.object({
  body: z
    .string()
    .min(1, "댓글 내용을 입력하세요")
    .max(2000, "댓글은 2000자 이내로 입력하세요"),
});

// ── 댓글 수정 ──────────────────────────────────────────────
export const commentUpdateSchema = z.object({
  comment_id: z.string().uuid("유효한 댓글 ID가 필요합니다"),
  body: z
    .string()
    .min(1, "댓글 내용을 입력하세요")
    .max(2000, "댓글은 2000자 이내로 입력하세요"),
});

// ── 댓글 삭제 ──────────────────────────────────────────────
export const commentDeleteSchema = z.object({
  comment_id: z.string().uuid("유효한 댓글 ID가 필요합니다"),
});

// ── 첨부파일 레코드 저장 ───────────────────────────────────
export const attachmentSaveSchema = z.object({
  file_url: z.string().regex(
    /^[a-z]+\/[0-9a-f-]{36}\/\d+_[0-9a-f-]{36}\.\w{2,5}$/,
    "유효하지 않은 파일 경로"
  ),
  file_name: z
    .string()
    .min(1, "파일명이 필요합니다")
    .max(255, "파일명이 너무 깁니다"),
  file_size: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional(),
  mime_type: z.string().optional(),
});

// ── 첨부파일 삭제 ──────────────────────────────────────────
export const attachmentDeleteSchema = z.object({
  attachment_id: z.string().uuid("유효한 첨부파일 ID가 필요합니다"),
});

// ── Upload 요청 스키마 ─────────────────────────────────────
export const uploadRequestSchema = z.object({
  bucket: z.enum(["content-images", "attachments"]),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  documentType: z.enum(["po", "pi", "shipping", "order", "customs"]),
  parentId: z.string().uuid(),
});
