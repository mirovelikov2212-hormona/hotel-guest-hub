import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let host = "missing";
  try {
    host = raw ? new URL(raw).host : "missing";
  } catch {
    host = "invalid";
  }

  const expectedPreviewHost = "tnhfguwnpspubnafrxwt.supabase.co";
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("hotel_scan_runs_v2")
    .select("id", { count: "exact", head: true });

  return NextResponse.json(
    {
      ok: host === expectedPreviewHost && !error,
      host,
      expectedPreviewHost,
      matchesExpectedPreview: host === expectedPreviewHost,
      v2ReadOk: !error,
      v2ScanCount: count ?? null,
      v2ReadError: error ? error.code || "query_failed" : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
