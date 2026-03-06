import { redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import { createSupabaseServerClient } from "./supabase.server";
import { ORG_TYPES } from "./constants";

export async function requireAuth(request: Request, context: AppLoadContext) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context
  );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    throw redirect("/login", { headers: responseHeaders });
  }

  return { user, supabase, responseHeaders };
}

export async function requireGVUser(
  request: Request,
  context: AppLoadContext
) {
  const { user, supabase, responseHeaders } = await requireAuth(
    request,
    context
  );

  if (user.app_metadata?.org_type !== ORG_TYPES.GV) {
    throw redirect("/saelim/delivery", { headers: responseHeaders });
  }

  return { user, supabase, responseHeaders };
}

export async function getOptionalUser(
  request: Request,
  context: AppLoadContext
) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase, responseHeaders };
}
