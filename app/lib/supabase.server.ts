import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { AppLoadContext } from "react-router";
import type { Database } from "~/types/database";

export function createSupabaseServerClient(
  request: Request,
  context: AppLoadContext
) {
  const responseHeaders = new Headers();

  const supabase = createServerClient<Database>(
    context.cloudflare.env.SUPABASE_URL,
    context.cloudflare.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
            ({ name, value }) => ({ name, value: value ?? "" })
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            responseHeaders.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            );
          });
        },
      },
    }
  );

  return { supabase, responseHeaders };
}
