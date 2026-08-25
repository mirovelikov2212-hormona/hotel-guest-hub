import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { hashPin } from "@/lib/staff-auth/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const EXPECTED_APPROVAL = {
  provisionSandboxCredentials: true,
  provisionProductionCredentials: false,
  rotateExisting: true,
} as const;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function hasExactApproval(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = Object.keys(EXPECTED_APPROVAL).sort();
  return (
    keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && record.provisionSandboxCredentials === true
    && record.provisionProductionCredentials === false
    && record.rotateExisting === true
  );
}

function generateUniquePins(roles: string[]) {
  const used = new Set<string>();
  const pins: Record<string, string> = {};
  for (const role of roles) {
    let pin = "";
    do {
      pin = String(crypto.randomInt(100_000, 1_000_000));
    } while (used.has(pin));
    used.add(pin);
    pins[role] = pin;
  }
  return pins;
}

function mapProvisioningError(message: string) {
  if (message.includes("ADMIN_FORBIDDEN")) return { status: 403, code: "forbidden" };
  if (message.includes("APPROVAL_REQUIRED")) return { status: 400, code: "approval_required" };
  if (
    message.includes("SANDBOX_INVALID")
    || message.includes("CERTIFICATION_MISMATCH")
    || message.includes("IDENTITY_NOT_CERTIFIED")
    || message.includes("PROPERTY_MAPPING_MISSING")
    || message.includes("ROLES_EMPTY")
  ) return { status: 409, code: "sandbox_not_ready" };
  if (message.includes("PRODUCTION_NOT_DARK")) return { status: 409, code: "production_not_dark" };
  if (message.includes("HASH") || message.includes("ROLE_SET")) return { status: 400, code: "credential_contract_invalid" };
  return { status: 503, code: "unavailable" };
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => null) as {
      sandboxHotelId?: unknown;
      expectedCertifiedRevisionId?: unknown;
      approval?: unknown;
    } | null;

    const sandboxHotelId = String(body?.sandboxHotelId || "").trim().toLowerCase();
    const expectedCertifiedRevisionId = String(body?.expectedCertifiedRevisionId || "").trim().toLowerCase();

    if (!UUID_PATTERN.test(sandboxHotelId) || !UUID_PATTERN.test(expectedCertifiedRevisionId)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }
    if (!hasExactApproval(body?.approval)) {
      return jsonResponse({ ok: false, error: "approval_required" }, 400);
    }

    const [{ data: hotel, error: hotelError }, { data: departments, error: departmentsError }] = await Promise.all([
      supabaseAdmin
        .from("hotels")
        .select("id, active, is_sandbox, production_hotel_id")
        .eq("id", sandboxHotelId)
        .maybeSingle(),
      supabaseAdmin
        .from("departments")
        .select("code")
        .eq("hotel_id", sandboxHotelId)
        .eq("active", true)
        .order("code", { ascending: true }),
    ]);

    if (hotelError || !hotel || hotel.active !== true || hotel.is_sandbox !== true || !hotel.production_hotel_id) {
      return jsonResponse({ ok: false, error: "sandbox_not_ready" }, 409);
    }
    if (departmentsError || !departments?.length) {
      return jsonResponse({ ok: false, error: "sandbox_not_ready" }, 409);
    }

    const roles = Array.from(new Set([
      "manager",
      ...departments.map((department) => String(department.code || "").trim().toLowerCase()).filter(Boolean),
    ])).sort();
    const pins = generateUniquePins(roles);
    const credentialHashes = Object.fromEntries(roles.map((role) => [role, hashPin(pins[role])]));

    const { data, error } = await supabaseAdmin.rpc("provision_factory_sandbox_staff_credentials_v1", {
      p_actor_admin_id: authority.adminId,
      p_sandbox_hotel_id: sandboxHotelId,
      p_expected_certified_revision_id: expectedCertifiedRevisionId,
      p_credential_hashes: credentialHashes,
      p_approval: EXPECTED_APPROVAL,
    });

    if (error) {
      const mapped = mapProvisioningError(error.message || "");
      return jsonResponse({ ok: false, error: mapped.code }, mapped.status);
    }

    const result = Array.isArray(data) ? data[0] : data;
    return jsonResponse({
      ok: true,
      sandboxHotelId,
      certifiedRevisionId: expectedCertifiedRevisionId,
      credentialCount: roles.length,
      roles,
      credentials: roles.map((role) => ({ role, pin: pins[role] })),
      productionCredentialsProvisioned: false,
      sessionsRevoked: true,
      result: result ?? null,
    }, 200);
  } catch (error) {
    console.error("Sandbox credential provisioning failed", error instanceof Error ? error.message : "unknown error");
    return jsonResponse({ ok: false, error: "unavailable" }, 503);
  }
}
