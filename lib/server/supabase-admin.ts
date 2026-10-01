import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("supabaseAdmin can only be used on the server");
}

type AdminClient = ReturnType<typeof createClient>;

let cachedAdminClient: AdminClient | null = null;

function resolveAdminCredentials() {
  const usePreviewTestSupabase = process.env.VERCEL_ENV === "preview";

  const supabaseUrl =
    (usePreviewTestSupabase ? process.env.STAYHUB_TEST_SUPABASE_URL : "") ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    (usePreviewTestSupabase ? process.env.STAYHUB_TEST_SUPABASE_SERVICE_ROLE_KEY : "") ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      usePreviewTestSupabase
        ? "Missing STAYHUB_TEST_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL"
        : "Missing NEXT_PUBLIC_SUPABASE_URL",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      usePreviewTestSupabase
        ? "Missing STAYHUB_TEST_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY"
        : "Missing SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

export function getSupabaseAdmin(): AdminClient {
  if (cachedAdminClient) return cachedAdminClient;

  const { supabaseUrl, serviceRoleKey } = resolveAdminCredentials();

  cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}

export const supabaseAdmin = new Proxy({} as AdminClient, {
  get(_target, property) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client as object, property, client);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
