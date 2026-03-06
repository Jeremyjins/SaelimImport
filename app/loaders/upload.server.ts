import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import { uploadRequestSchema } from "~/loaders/content.schema";

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

// Signed URL 방식에서는 서버가 파일 바이트를 볼 수 없으므로 magic byte 검증 불가.
// 최종 방어선: Supabase 버킷 allowed_mime_types 설정.

// MIME 타입 → 안전한 파일 확장자 맵
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/csv": "csv",
};

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function action({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { bucket, fileName, contentType, documentType, parentId } = parsed.data;

  // MIME 타입 서버 검증 (클라이언트 Content-Type 신뢰 안 함)
  const allowedTypes =
    bucket === "content-images" ? ALLOWED_IMAGE_TYPES : ALLOWED_ATTACHMENT_TYPES;

  if (!allowedTypes.has(contentType)) {
    return data(
      { error: "허용되지 않는 파일 형식입니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // SVG 차단 (XSS 위험)
  if (contentType === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg")) {
    return data(
      { error: "SVG 파일은 업로드할 수 없습니다." },
      { status: 400, headers: responseHeaders }
    );
  }

  // 파일명 sanitize (MIME 기반 안전 확장자 + UUID 경로)
  const ext = MIME_TO_EXT[contentType] ?? "bin";
  const safePath = `${documentType}/${parentId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  // Signed Upload URL 생성
  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(safePath);

  if (signedError || !signedData) {
    return data(
      { error: "업로드 URL 생성에 실패했습니다." },
      { status: 500, headers: responseHeaders }
    );
  }

  // Public URL (content-images 버킷만 — public 버킷)
  let publicUrl: string | null = null;
  if (bucket === "content-images") {
    const { data: urlData } = supabase.storage
      .from("content-images")
      .getPublicUrl(safePath);
    publicUrl = urlData.publicUrl;
  }

  return data(
    {
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: safePath,
      publicUrl,
    },
    { headers: responseHeaders }
  );
}
