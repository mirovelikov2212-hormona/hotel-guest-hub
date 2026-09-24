import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("supabaseAdmin can only be used on the server");
}

const usePreviewTestSupabase = process.env.VERCEL_ENV === "preview";

const supabaseUrl =
  (usePreviewTestSupabase ? process.env.STAYHUB_TEST_SUPABASE_URL : "") ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  (usePreviewTestSupabase ? process.env.STAYHUB_TEST_SUPABASE_SERVICE_ROLE_KEY : "") ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export function getSupabaseAdmin() {
  return supabaseAdmin;
}