import { data } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";

// S-4: z.preprocess 패턴으로 숫자 필드 타입 누수 제거
const optionalPositiveInt = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional()
);

const productSchema = z.object({
  _action: z.enum(["create", "update"]),
  id: z.string().uuid().optional(),
  name: z.string().min(1, "제품명을 입력하세요"),
  gsm: optionalPositiveInt,
  width_mm: optionalPositiveInt,
  hs_code: z.string().optional(),
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

  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .is("deleted_at", null)
    .order("name");

  if (error) {
    return data({ products: [], error: "데이터를 불러오는 데 실패했습니다." }, { headers: responseHeaders });
  }

  return data({ products: products ?? [] }, { headers: responseHeaders });
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
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (error) {
      return data({ success: false, error: "삭제에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }
    return data({ success: true }, { headers: responseHeaders });
  }

  const raw = Object.fromEntries(formData);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
      { status: 400, headers: responseHeaders }
    );
  }

  const { _action, id, name, gsm, width_mm, hs_code } = parsed.data;

  const fields = {
    name,
    gsm: gsm ?? null,
    width_mm: width_mm ?? null,
    hs_code: hs_code || null,
  };

  if (_action === "create") {
    const { error } = await supabase.from("products").insert(fields);
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
    const { error } = await supabase.from("products").update(fields).eq("id", id);
    if (error) {
      return data({ success: false, error: "수정에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }
  }

  return data({ success: true }, { headers: responseHeaders });
}
