import type { Json } from "~/types/database";

export type ContentType = "po" | "pi" | "shipping" | "order" | "customs";

export interface ContentAttachment {
  id: string;
  file_name: string;
  file_size: number | null;
  file_url: string;
  mime_type: string | null;
  created_by: string | null;
  created_at: string | null;
  signed_url?: string | null; // private 버킷 파일용 (로더에서 주입)
}

export interface Comment {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ContentItem {
  id: string;
  body: Json | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  attachments: ContentAttachment[];
  comments: Comment[];
}

// 로더에서 반환하는 content 데이터 (null이면 아직 생성 안 됨)
export interface ContentData {
  content: ContentItem | null;
}
