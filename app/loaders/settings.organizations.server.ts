import { data } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";

const orgSchema = z.object({
  _action: z.enum(["create", "update"]),
  id: z.string().uuid().optional(),
  type: z.enum(["supplier", "seller", "buyer"]),
  name_en: z.string().min(1, "영문명을 입력하세요"),
  name_ko: z.string().optional(),
  address_en: z.string().optional(),
  address_ko: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid("올바른 ID가 아닙니다."),
});

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("*")
    .is("deleted_at", null)
    .order("type")
    .order("name_en");

  if (error) {
    return data({ orgs: [], error: "데이터를 불러오는 데 실패했습니다." }, { headers: responseHeaders });
  }

  return data({ orgs: orgs ?? [] }, { headers: responseHeaders });
}

export async function action({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  if (intent === "delete") {
    // S-5: UUID 형식 검증
    const parsed = deleteSchema.safeParse({ id: formData.get("id") });
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "ID가 필요합니다." },
        { status: 400, headers: responseHeaders }
      );
    }
    const { error } = await supabase
      .from("organizations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (error) {
      return data({ success: false, error: "삭제에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }
    return data({ success: true }, { headers: responseHeaders });
  }

  const raw = Object.fromEntries(formData);
  const parsed = orgSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { _action, id, ...fields } = parsed.data;

  if (_action === "create") {
    const { error } = await supabase.from("organizations").insert({
      type: fields.type,
      name_en: fields.name_en,
      name_ko: fields.name_ko || null,
      address_en: fields.address_en || null,
      address_ko: fields.address_ko || null,
      phone: fields.phone || null,
      fax: fields.fax || null,
    });
    if (error) {
      return data({ success: false, error: "저장에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }
  } else if (_action === "update") {
    // M-2: id 누락 시 명시적 에러 반환
    if (!id) {
      return data(
        { success: false, error: "수정할 항목의 ID가 필요합니다." },
        { status: 400, headers: responseHeaders }
      );
    }
    const { error } = await supabase
      .from("organizations")
      .update({
        type: fields.type,
        name_en: fields.name_en,
        name_ko: fields.name_ko || null,
        address_en: fields.address_en || null,
        address_ko: fields.address_ko || null,
        phone: fields.phone || null,
        fax: fields.fax || null,
      })
      .eq("id", id);
    if (error) {
      return data({ success: false, error: "수정에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }
  }

  return data({ success: true }, { headers: responseHeaders });
}
