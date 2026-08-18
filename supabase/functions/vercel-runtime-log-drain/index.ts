import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

import { normalizeVercelLogBatch } from "./vercel-log-normalizer.mjs";

const EXPECTED_PROJECT_ID = "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const MAX_RAW_BODY_BYTES = 2_000_000;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha1Hex(rawBody: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(left: string, right: string) {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const drainSecret = String(Deno.env.get("VERCEL_LOG_DRAIN_SECRET") || "").trim();
  if (!drainSecret) {
    return jsonResponse(503, { ok: false, error: "drain_not_configured" });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_RAW_BODY_BYTES) {
    return jsonResponse(413, { ok: false, error: "payload_too_large" });
  }

  const headerSignature = String(request.headers.get("x-vercel-signature") || "").trim();
  const expectedSignature = await hmacSha1Hex(rawBody, drainSecret);
  if (!constantTimeEqualHex(headerSignature, expectedSignature)) {
    return jsonResponse(403, { ok: false, error: "invalid_signature" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  let events: Awaited<ReturnType<typeof normalizeVercelLogBatch>>;
  try {
    events = await normalizeVercelLogBatch(payload, EXPECTED_PROJECT_ID);
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_payload" });
  }

  if (events.length === 0) {
    return jsonResponse(200, { ok: true, accepted: 0, duplicates: 0 });
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { ok: false, error: "storage_not_configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("ingest_factory_vercel_runtime_log_batch_v1", {
    p_events: events,
  });

  if (error) {
    return jsonResponse(500, { ok: false, error: "storage_failed" });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return jsonResponse(200, {
    ok: true,
    accepted: Number(row?.inserted_count || 0),
    duplicates: Number(row?.duplicate_count || 0),
  });
});
