import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import type { PlatformAdminAuthority, PlatformAdminRole } from "@/lib/server/control-plane-auth";
import {
  getFactoryPreviewRuntimeSmokeStatus,
  settleFactoryPreviewRuntimeSmoke,
  startFactoryPreviewRuntimeSmoke,
} from "@/lib/server/factory-preview-runtime-smoke";
import { getFactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { certifyFactorySandboxFromTrustedEvidence } from "@/lib/server/factory-trusted-sandbox-certification";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUTATING_ROLES = new Set<PlatformAdminRole>(["super_admin", "operator"]);
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function normalizeUuid(value: unknown, code: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

async function requireProofAuthority(actorAdminIdInput: unknown): Promise<PlatformAdminAuthority> {
  const actorAdminId = normalizeUuid(actorAdminIdInput, "PROOF_RUNNER_ACTOR_INVALID");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, auth_user_id, email_snapshot, role, active")
    .eq("id", actorAdminId)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) throw new Error("PROOF_RUNNER_ACTOR_FORBIDDEN");

  const role = String(data.role || "") as PlatformAdminRole;
  if (!MUTATING_ROLES.has(role)) throw new Error("PROOF_RUNNER_ACTOR_FORBIDDEN");

  return {
    adminId: String(data.id),
    authUserId: String(data.auth_user_id),
    email: data.email_snapshot ? String(data.email_snapshot) : null,
    role,
  };
}

async function requireDisposableProofLineage(envelopeProjectionRunIdInput: unknown) {
  const envelopeProjectionRunId = normalizeUuid(
    envelopeProjectionRunIdInput,
    "PROOF_RUNNER_ENVELOPE_INVALID",
  );
  const preflight = await getFactorySandboxPreflight(envelopeProjectionRunId);
  if (!preflight) throw new Error("PROOF_RUNNER_ENVELOPE_NOT_FOUND");

  const { data: run, error: runError } = await supabaseAdmin
    .from("factory_onboarding_runs")
    .select("id, idempotency_key, organization_id, property_id, production_hotel_id, sandbox_hotel_id")
    .eq("production_hotel_id", preflight.lineage.productionHotelId)
    .eq("sandbox_hotel_id", preflight.lineage.sandboxHotelId)
    .maybeSingle();
  if (runError || !run || !String(run.idempotency_key || "").startsWith("proof:")) {
    throw new Error("PROOF_RUNNER_NAMESPACE_FORBIDDEN");
  }

  const [{ data: organization }, { data: property }, { data: production }, { data: sandbox }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, slug").eq("id", run.organization_id).maybeSingle(),
    supabaseAdmin.from("properties").select("id, property_key, lifecycle_state").eq("id", run.property_id).maybeSingle(),
    supabaseAdmin.from("hotels").select("id, active, is_sandbox, is_demo, production_hotel_id").eq("id", run.production_hotel_id).maybeSingle(),
    supabaseAdmin.from("hotels").select("id, active, is_sandbox, is_demo, production_hotel_id").eq("id", run.sandbox_hotel_id).maybeSingle(),
  ]);

  if (!organization || !String(organization.slug || "").startsWith("proof-")) {
    throw new Error("PROOF_RUNNER_ORGANIZATION_FORBIDDEN");
  }
  if (
    !property
    || !String(property.property_key || "").startsWith("proof-")
    || String(property.lifecycle_state || "") !== "draft"
  ) {
    throw new Error("PROOF_RUNNER_PROPERTY_FORBIDDEN");
  }
  if (!production || production.active === true || production.is_sandbox === true || production.is_demo === true) {
    throw new Error("PROOF_RUNNER_PRODUCTION_FORBIDDEN");
  }
  if (
    !sandbox
    || sandbox.is_sandbox !== true
    || sandbox.is_demo === true
    || String(sandbox.production_hotel_id || "") !== String(production.id)
  ) {
    throw new Error("PROOF_RUNNER_SANDBOX_FORBIDDEN");
  }

  return { envelopeProjectionRunId, preflight };
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return response({ ok: false, error: "not_found" }, 404);
  }

  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return response({ ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return response({ ok: false, error: "payload_too_large" }, 413);
    }
    const body = JSON.parse(rawBody) as {
      action?: unknown;
      actorAdminId?: unknown;
      envelopeProjectionRunId?: unknown;
      smokeRunId?: unknown;
    };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ ok: false, error: "invalid_request" }, 400);
    }

    const authority = await requireProofAuthority(body.actorAdminId);
    const { envelopeProjectionRunId } = await requireDisposableProofLineage(body.envelopeProjectionRunId);
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "start") {
      const result = await startFactoryPreviewRuntimeSmoke(envelopeProjectionRunId);
      return response({ ok: true, proofOnly: true, ...result }, 201);
    }
    if (action === "settle") {
      const result = await settleFactoryPreviewRuntimeSmoke({
        envelopeProjectionRunId,
        smokeRunId: body.smokeRunId,
      });
      return response({ ok: true, proofOnly: true, ...result }, result.state === "waiting" ? 202 : 200);
    }
    if (action === "status") {
      const result = await getFactoryPreviewRuntimeSmokeStatus({
        envelopeProjectionRunId,
        smokeRunId: body.smokeRunId,
      });
      return response({ ok: true, proofOnly: true, ...result }, 200);
    }
    if (action === "certify") {
      const result = await certifyFactorySandboxFromTrustedEvidence({
        authority,
        envelopeProjectionRunId,
        smokeRunId: body.smokeRunId,
      });
      return response({ ok: true, proofOnly: true, ...result }, 200);
    }

    return response({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("Disposable Factory proof runner failed", message);
    return response({ ok: false, error: message.split(":")[0] || "unavailable" }, 409);
  }
}
