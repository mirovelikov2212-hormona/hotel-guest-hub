import { createClient } from "@supabase/supabase-js";

const usePreviewTestSupabase = process.env.VERCEL_ENV === "preview";
const previewDiagnosticUrl = "https://tnhfguwnpspubnafrxwt.supabase.co";
const previewDiagnosticPublishableKey = "sb_publishable_jfATVNOy5DyRYdlAE58Jjg_i3NXUX1z";

const supabaseUrl = usePreviewTestSupabase
  ? previewDiagnosticUrl
  : process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = usePreviewTestSupabase
  ? previewDiagnosticPublishableKey
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
