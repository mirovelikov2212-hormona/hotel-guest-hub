import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let host = "missing";
  try {
    host = raw ? new URL(raw).host : "missing";
  } catch {
    host = "invalid";
  }

  return NextResponse.json(
    {
      ok: true,
      host,
      expectedPreviewHost: "tnhfguwnpspubnafrxwt.supabase.co",
      matchesExpectedPreview: host === "tnhfguwnpspubnafrxwt.supabase.co",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
