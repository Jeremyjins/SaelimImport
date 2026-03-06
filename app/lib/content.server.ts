import { data } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "~/types/database";
import type { ContentType, ContentItem } from "~/types/content";
import {
  contentSaveSchema,
  contentDeleteSchema,
  commentCreateSchema,
  commentUpdateSchema,
  commentDeleteSchema,
  attachmentSaveSchema,
  attachmentDeleteSchema,
} from "~/loaders/content.schema";

// ── 부모 문서 테이블 매핑 ──────────────────────────────────
const PARENT_TABLE_MAP: Record<ContentType, string> = {
  po: "purchase_orders",
  pi: "proforma_invoices",
  shipping: "shipping_documents",
  order: "orders",
  customs: "customs",
  delivery: "deliveries",
};

// ── 콘텐츠 조회 ────────────────────────────────────────────
// 각 모듈의 loader에서 Promise.all에 추가하여 사용

export async function loadContent(
  supabase: SupabaseClient<Database>,
  contentType: ContentType,
  parentId: string
): Promise<{ content: ContentItem | null }> {
  // Step 1: contents 레코드 조회
  const { data: contentRow, error: contentError } = await supabase
    .from("contents")
    .select("id, body, created_by, created_at, updated_at")
    .eq("type", contentType)
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contentError || !contentRow) {
    return { content: null };
  }

  // Step 2: 첨부파일 + 댓글 병렬 조회
  const [{ data: attachments }, { data: comments }] = await Promise.all([
    supabase
      .from("content_attachments")
      .select(
        "id, file_name, file_size, file_url, mime_type, created_by, created_at"
      )
      .eq("content_id", contentRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("comments")
      .select("id, body, created_by, created_at, updated_at")
      .eq("content_id", contentRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  // attachments 버킷 파일에 대해 signed URL 배치 생성 (1시간 유효)
  const attachmentList = attachments ?? [];
  type AttWithUrl = (typeof attachmentList)[number] & { signed_url: string | null };
  let attachmentsWithUrls: AttWithUrl[] = [];

  if (attachmentList.length > 0) {
    const paths = attachmentList.map((att) => att.file_url);
    const { data: signedUrlsData } = await supabase.storage
      .from("attachments")
      .createSignedUrls(paths, 3600);
    attachmentsWithUrls = attachmentList.map((att, i) => ({
      ...att,
      signed_url: signedUrlsData?.[i]?.signedUrl ?? null,
    }));
  }

  return {
    content: {
      ...contentRow,
      attachments: attachmentsWithUrls,
      comments: comments ?? [],
    },
  };
}

// ── 부모 문서 존재 확인 ────────────────────────────────────

async function verifyParentExists(
  supabase: SupabaseClient<Database>,
  contentType: ContentType,
  parentId: string
): Promise<boolean> {
  const table = PARENT_TABLE_MAP[contentType];
  if (!table) return false;

  const { count } = await (supabase as SupabaseClient)
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("id", parentId)
    .is("deleted_at", null);

  return (count ?? 0) > 0;
}

// ── 공유 Action Handler ────────────────────────────────────
// 각 모듈의 action에서 intent.startsWith("content_") 시 호출

export async function handleContentAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  contentType: ContentType,
  parentId: string,
  intent: string,
  formData: FormData,
  responseHeaders: Headers
) {
  switch (intent) {
    case "content_save":
      return handleContentSave(
        supabase,
        userId,
        contentType,
        parentId,
        formData,
        responseHeaders
      );
    case "content_delete":
      return handleContentDelete(supabase, formData, responseHeaders);
    case "content_add_comment":
      return handleCommentCreate(
        supabase,
        userId,
        contentType,
        parentId,
        formData,
        responseHeaders
      );
    case "content_update_comment":
      return handleCommentUpdate(supabase, userId, formData, responseHeaders);
    case "content_delete_comment":
      return handleCommentDelete(supabase, formData, responseHeaders);
    case "content_save_attachment":
      return handleAttachmentSave(
        supabase,
        userId,
        contentType,
        parentId,
        formData,
        responseHeaders
      );
    case "content_delete_attachment":
      return handleAttachmentDelete(supabase, formData, responseHeaders);
    default:
      return null; // null이면 기존 action 로직으로 fall-through
  }
}

// ── 콘텐츠 저장 (Upsert) ──────────────────────────────────

async function handleContentSave(
  supabase: SupabaseClient<Database>,
  userId: string,
  contentType: ContentType,
  parentId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = contentSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // body JSON 파싱
  let parsedBody: Json | null = null;
  if (parsed.data.body) {
    try {
      parsedBody = JSON.parse(parsed.data.body) as Json;
    } catch {
      return data(
        { success: false, error: "본문 형식이 올바르지 않습니다." },
        { status: 400, headers: responseHeaders }
      );
    }
  }

  // 부모 문서 존재 확인
  const parentExists = await verifyParentExists(supabase, contentType, parentId);
  if (!parentExists) {
    return data(
      { success: false, error: "대상 문서를 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  // Upsert (1:1 UNIQUE 제약으로 충돌 시 UPDATE)
  const { error: upsertError } = await (supabase as SupabaseClient)
    .from("contents")
    .upsert(
      {
        type: contentType,
        parent_id: parentId,
        body: parsedBody,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "type,parent_id" }
    );

  if (upsertError) {
    return data(
      { success: false, error: "저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}

// ── 콘텐츠 삭제 (Soft Delete) ─────────────────────────────

async function handleContentDelete(
  supabase: SupabaseClient<Database>,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = contentDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { error } = await supabase
    .from("contents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.content_id)
    .is("deleted_at", null);

  if (error) {
    return data(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}

// ── 댓글 생성 ──────────────────────────────────────────────

async function handleCommentCreate(
  supabase: SupabaseClient<Database>,
  userId: string,
  contentType: ContentType,
  parentId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = commentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // content_id가 없으면 빈 content 생성
  const contentId = await ensureContentExists(
    supabase,
    userId,
    contentType,
    parentId
  );
  if (!contentId) {
    return data(
      { success: false, error: "콘텐츠 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  const { error } = await supabase.from("comments").insert({
    content_id: contentId,
    body: parsed.data.body,
    created_by: userId,
  });

  if (error) {
    return data(
      { success: false, error: "댓글 저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}

// ── 댓글 수정 ──────────────────────────────────────────────

async function handleCommentUpdate(
  supabase: SupabaseClient<Database>,
  userId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = commentUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { error } = await supabase
    .from("comments")
    .update({
      body: parsed.data.body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.comment_id)
    .eq("created_by", userId) // 본인 댓글만 수정
    .is("deleted_at", null);

  if (error) {
    return data(
      { success: false, error: "댓글 수정 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}

// ── 댓글 삭제 (Soft Delete) ───────────────────────────────

async function handleCommentDelete(
  supabase: SupabaseClient<Database>,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = commentDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.comment_id)
    .is("deleted_at", null);
  // NOTE: 소유자 검증 없음 — 내부 GV팀 한정 시스템으로 팀원 간 댓글 관리(모더레이션) 허용

  if (error) {
    return data(
      { success: false, error: "댓글 삭제 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}

// ── 첨부파일 레코드 저장 ───────────────────────────────────
// 클라이언트에서 Signed URL로 Storage 업로드 완료 후 호출

async function handleAttachmentSave(
  supabase: SupabaseClient<Database>,
  userId: string,
  contentType: ContentType,
  parentId: string,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = attachmentSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  // content 레코드 확보 (없으면 생성)
  const contentId = await ensureContentExists(
    supabase,
    userId,
    contentType,
    parentId
  );
  if (!contentId) {
    return data(
      { success: false, error: "콘텐츠 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  const { error } = await (supabase as SupabaseClient)
    .from("content_attachments")
    .insert({
      content_id: contentId,
      file_url: parsed.data.file_url,
      file_name: parsed.data.file_name,
      file_size: parsed.data.file_size ?? null,
      mime_type: parsed.data.mime_type ?? null,
      created_by: userId,
    });

  if (error) {
    return data(
      { success: false, error: "첨부파일 저장 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  return data({ success: true }, { headers: responseHeaders });
}

// ── 첨부파일 삭제 (레코드 + Storage) ──────────────────────

async function handleAttachmentDelete(
  supabase: SupabaseClient<Database>,
  formData: FormData,
  responseHeaders: Headers
) {
  const raw = Object.fromEntries(formData);
  const parsed = attachmentDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 먼저 파일 경로 조회
  const { data: attachment, error: fetchError } = await (supabase as SupabaseClient)
    .from("content_attachments")
    .select("id, file_url")
    .eq("id", parsed.data.attachment_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !attachment) {
    return data(
      { success: false, error: "첨부파일을 찾을 수 없습니다." },
      { status: 404, headers: responseHeaders }
    );
  }

  // Soft delete 레코드
  const { error: deleteError } = await (supabase as SupabaseClient)
    .from("content_attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.attachment_id);

  if (deleteError) {
    return data(
      { success: false, error: "첨부파일 삭제 중 오류가 발생했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Storage에서 실제 파일 삭제 (best-effort — 실패해도 계속)
  // content_attachments는 항상 "attachments" 버킷 사용
  const fileUrl = (attachment as { id: string; file_url: string }).file_url;
  await supabase.storage.from("attachments").remove([fileUrl]);

  return data({ success: true }, { headers: responseHeaders });
}

// ── 내부 헬퍼: content 레코드 보장 ────────────────────────
// 없으면 빈 body로 생성, 있으면 id 반환

async function ensureContentExists(
  supabase: SupabaseClient<Database>,
  userId: string,
  contentType: ContentType,
  parentId: string
): Promise<string | null> {
  // 기존 content 조회
  const { data: existing } = await supabase
    .from("contents")
    .select("id")
    .eq("type", contentType)
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) return existing.id;

  // 없으면 생성
  const { data: created, error } = await (supabase as SupabaseClient)
    .from("contents")
    .insert({
      type: contentType,
      parent_id: parentId,
      body: null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) return null;
  return (created as { id: string }).id;
}
