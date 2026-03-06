import { redirect, data } from "react-router";
import type { AppLoadContext } from "react-router";
import { z } from "zod";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { getOptionalUser } from "~/lib/auth.server";
import { ORG_TYPES } from "~/lib/constants";

interface AuthArgs {
  request: Request;
  context: AppLoadContext;
}

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function loginLoader({ request, context }: AuthArgs) {
  const { user, responseHeaders } = await getOptionalUser(request, context);
  if (user) {
    const orgType = user.app_metadata?.org_type;
    throw redirect(
      orgType === ORG_TYPES.SAELIM ? "/saelim/delivery" : "/",
      { headers: responseHeaders }
    );
  }
  return {};
}

export async function loginAction({ request, context }: AuthArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context
  );
  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return data(
      { error: "이메일과 비밀번호를 입력해 주세요." },
      { status: 400 }
    );
  }

  const { data: signInData, error } = await supabase.auth.signInWithPassword(
    parsed.data
  );

  if (error) {
    return data(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 401, headers: responseHeaders }
    );
  }

  const orgType = signInData.user?.app_metadata?.org_type;
  const redirectTo = orgType === ORG_TYPES.SAELIM ? "/saelim/delivery" : "/";

  throw redirect(redirectTo, { headers: responseHeaders });
}

export async function logoutAction({ request, context }: AuthArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context
  );
  await supabase.auth.signOut();
  throw redirect("/login", { headers: responseHeaders });
}
