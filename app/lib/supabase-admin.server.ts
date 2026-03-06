import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";

interface AdminEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export function createSupabaseAdminClient(env: AdminEnv) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
