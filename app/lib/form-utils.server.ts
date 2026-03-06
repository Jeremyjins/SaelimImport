import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";

type Supabase = SupabaseClient<Database>;

/**
 * FormData에서 JSONB 필드를 파싱하고 Zod 스키마로 검증하는 공통 헬퍼.
 * PO/PI/Shipping/Customs/Delivery의 details, fees 등 JSONB 필드에 사용.
 *
 * @example
 * const result = parseJSONBField(formData, z.array(lineItemSchema).min(1).max(20));
 * if ("error" in result) return data({ success: false, error: result.error }, { status: 400 });
 * const items = result.data;
 */
export function parseJSONBField<T>(
  formData: FormData,
  schema: z.ZodSchema<T[]>,
  fieldName = "details"
): { data: T[] } | { error: string } {
  const raw = formData.get(fieldName) as string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return { error: "잘못된 데이터 형식입니다." };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "유효하지 않은 데이터입니다." };
  }
  return { data: result.data };
}

/**
 * Organization이 활성 상태인지 검증하는 공통 헬퍼.
 * soft-deleted(deleted_at IS NOT NULL) org 참조를 차단.
 *
 * @example
 * const valid = await validateOrgExists(supabase, parsed.data.supplier_id);
 * if (!valid) return data({ success: false, error: "선택한 업체가 유효하지 않습니다." }, { status: 400 });
 */
export async function validateOrgExists(
  supabase: Supabase,
  orgId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("id", orgId)
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}
