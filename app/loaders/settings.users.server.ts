import { data } from "react-router";
import { z } from "zod";
import type { AppLoadContext } from "react-router";
import { requireGVUser } from "~/lib/auth.server";
import { createSupabaseAdminClient } from "~/lib/supabase-admin.server";

const inviteSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
  name: z.string().min(1, "이름을 입력하세요"),
  org_id: z.string().uuid("조직을 선택하세요"),
  role: z.enum(["admin", "member"]).default("member"),
});

const deleteSchema = z.object({
  user_id: z.string().uuid("올바른 사용자 ID가 아닙니다."),
});

const updateSchema = z.object({
  user_id: z.string().uuid("올바른 사용자 ID가 아닙니다."),
  name: z.string().min(1, "이름을 입력하세요"),
  org_id: z.string().uuid("조직을 선택하세요"),
  role: z.enum(["admin", "member"]),
});

// org.type(DB) → org_type(app_metadata) 매핑
const ORG_TYPE_MAP: Record<string, string> = {
  seller: "gv",
  buyer: "saelim",
  supplier: "supplier",
};

interface LoaderArgs {
  request: Request;
  context: AppLoadContext;
}

export async function loader({ request, context }: LoaderArgs) {
  const { supabase, responseHeaders } = await requireGVUser(request, context);
  const adminClient = createSupabaseAdminClient(context.cloudflare.env);

  const [usersRes, profilesRes, orgsRes] = await Promise.all([
    adminClient.auth.admin.listUsers(),
    supabase.from("user_profiles").select("id, name, org_id, role, created_at"),
    supabase.from("organizations").select("id, name_en, name_ko, type").is("deleted_at", null),
  ]);

  const authUsers = usersRes.data?.users ?? [];
  const profiles = profilesRes.data ?? [];
  const orgs = orgsRes.data ?? [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const users = authUsers.map((u) => {
    const profile = profileMap.get(u.id);
    const org = profile?.org_id ? orgMap.get(profile.org_id) : null;
    return {
      id: u.id,
      email: u.email ?? "",
      name: profile?.name ?? "",
      role: profile?.role ?? "member",
      org_id: profile?.org_id ?? null,
      org_name: org ? (org.name_ko ?? org.name_en) : null,
      org_type: (u.app_metadata?.org_type as string) ?? null,
      invited_at: u.invited_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed_at: u.confirmed_at ?? null,
    };
  });

  return data({ users, orgs }, { headers: responseHeaders });
}

export async function action({ request, context }: LoaderArgs) {
  const { user, responseHeaders } = await requireGVUser(request, context);
  const adminClient = createSupabaseAdminClient(context.cloudflare.env);
  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  if (intent === "invite") {
    const raw = Object.fromEntries(formData);
    const parsed = inviteSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { email, name, org_id, role } = parsed.data;

    // S-1: org_type을 클라이언트 입력이 아닌 서버에서 org_id 기반으로 파생
    const { data: orgData, error: orgError } = await adminClient
      .from("organizations")
      .select("type")
      .eq("id", org_id)
      .is("deleted_at", null)
      .single();

    if (orgError || !orgData) {
      return data(
        { success: false, error: "선택한 조직을 찾을 수 없습니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const org_type = ORG_TYPE_MAP[orgData.type] ?? "supplier";

    // Step 1: 사용자 초대
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name },
    });

    if (inviteError) {
      return data({ success: false, error: "초대 발송에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }

    const userId = inviteData.user.id;

    // Step 2: app_metadata 설정 (org_type, org_id)
    const { error: metaError } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: { org_type, org_id },
    });

    if (metaError) {
      // C-2: 보상 트랜잭션 - Step 1 롤백
      await adminClient.auth.admin.deleteUser(userId);
      return data(
        { success: false, error: "사용자 설정에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // Step 3: user_profiles 생성 (M-3: adminClient 사용으로 RLS 의존 제거)
    const { error: profileError } = await adminClient.from("user_profiles").insert({
      id: userId,
      name,
      org_id,
      role,
    });

    if (profileError) {
      // C-2: 보상 트랜잭션 - Step 1 롤백 (CASCADE로 profile도 정리됨)
      await adminClient.auth.admin.deleteUser(userId);
      return data(
        { success: false, error: "사용자 프로필 생성에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  if (intent === "delete") {
    // C-1: UUID 형식 검증
    const parsed = deleteSchema.safeParse({ user_id: formData.get("user_id") });
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "올바른 사용자 ID가 아닙니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { user_id } = parsed.data;

    // C-1: 자기 자신 삭제 방지
    if (user_id === user.id) {
      return data(
        { success: false, error: "자기 자신은 삭제할 수 없습니다." },
        { status: 403, headers: responseHeaders }
      );
    }

    const { error } = await adminClient.auth.admin.deleteUser(user_id);
    if (error) {
      return data({ success: false, error: "사용자 삭제에 실패했습니다." }, { status: 500, headers: responseHeaders });
    }
    return data({ success: true }, { headers: responseHeaders });
  }

  if (intent === "update") {
    const raw = Object.fromEntries(formData);
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return data(
        { success: false, error: parsed.error.issues[0]?.message ?? "입력 값을 확인하세요." },
        { status: 400, headers: responseHeaders }
      );
    }

    const { user_id, name, org_id, role } = parsed.data;

    // 자기 자신 org 변경은 허용하되 role 변경만 제한하지 않음 (admin은 모든 수정 가능)

    // 조직 정보 조회 (org_type 파생)
    const { data: orgData, error: orgError } = await adminClient
      .from("organizations")
      .select("type")
      .eq("id", org_id)
      .is("deleted_at", null)
      .single();

    if (orgError || !orgData) {
      return data(
        { success: false, error: "선택한 조직을 찾을 수 없습니다." },
        { status: 400, headers: responseHeaders }
      );
    }

    const org_type = ORG_TYPE_MAP[orgData.type] ?? "supplier";

    // app_metadata 업데이트
    const { error: metaError } = await adminClient.auth.admin.updateUserById(user_id, {
      app_metadata: { org_type, org_id },
    });

    if (metaError) {
      return data(
        { success: false, error: "사용자 메타데이터 업데이트에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    // user_profiles 업데이트
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .update({ name, org_id, role })
      .eq("id", user_id);

    if (profileError) {
      return data(
        { success: false, error: "사용자 프로필 업데이트에 실패했습니다." },
        { status: 500, headers: responseHeaders }
      );
    }

    return data({ success: true }, { headers: responseHeaders });
  }

  return data({ success: false, error: "알 수 없는 액션입니다." }, { status: 400, headers: responseHeaders });
}
