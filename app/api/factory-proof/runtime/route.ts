import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import type { PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import {
  getFactoryPreviewRuntimeSmokeStatus,
  settleFactoryPreviewRuntimeSmoke,
  startFactoryPreviewRuntimeSmoke,
} from "@/lib/server/factory-preview-runtime-smoke";
import { getFactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { certifyFactorySandboxFromTrustedEvidence } from "@/lib/server/factory-trusted-sandbox-certification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_BRANCH = "proof-runner/disposable-e2e-20260819-0835";
const EXPECTED_ENVELOPE_ID = "523e5f46-7871-4061-bf4d-115b555cfc98";
const EXPECTED_ONBOARDING_RUN_ID = "c22be8f6-6cb0-4fd1-89a8-1489af42cb18";
const EXPECTED_PRODUCTION_HOTEL_ID = "2fe51e8f-4ae8-4ac3-a96b-d97f3cee62ed";
const EXPECTED_SANDBOX_HOTEL_ID = "88be3201-6306-45df-835f-18916f70c832";
const EXPECTED_PRODUCTION_REVISION_ID = "f41dd750-6e61-48d7-b544-75b859189f57";
const EXPECTED_SANDBOX_REVISION_ID = "adac0791-466e-4ecf-99fc-9c0c5c1552eb";
const PROOF_TOKEN_SHA256 = "992322135cc118e382372e23faa229361787610c378da0ea9a6c36e0cb2fd7be";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const PROOF_AUTHORITY: PlatformAdminAuthority = {
  adminId: "edfcd3a6-c51a-4935-a70f-e4e477ec85ee",
  authUserId: "d56dd754-07dc-4f7e-a457-6515ce62a8a8",
  email: "admin@stayhub.app",
  role: "super_admin",
};

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function hasValidOneTimeToken(req: NextRequest) {
  const supplied = String(req.nextUrl.searchParams.get("token") || "");
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  const expectedDigest = Buffer.from(PROOF_TOKEN_SHA256, "hex");
  return suppliedDigest.length === expectedDigest.length && timingSafeEqual(suppliedDigest, expectedDigest);
}

async function requireExactDisposableProofLineage() {
  const preflight = await getFactorySandboxPreflight(EXPECTED_ENVELOPE_ID);
  if (!preflight) throw new Error("PROOF_RUNNER_ENVELOPE_NOT_FOUND");

  if (
    preflight.envelopeProjectionRunId !== EXPECTED_ENVELOPE_ID
    || preflight.lineage.onboardingRunId !== EXPECTED_ONBOARDING_RUN_ID
    || preflight.lineage.envelopeProjectionRunId !== EXPECTED_ENVELOPE_ID
    || preflight.lineage.productionHotelId !== EXPECTED_PRODUCTION_HOTEL_ID
    || preflight.lineage.sandboxHotelId !== EXPECTED_SANDBOX_HOTEL_ID
    || preflight.lineage.productionRevisionId !== EXPECTED_PRODUCTION_REVISION_ID
    || preflight.lineage.sandboxRevisionId !== EXPECTED_SANDBOX_REVISION_ID
  ) {
    throw new Error("PROOF_RUNNER_LINEAGE_MISMATCH");
  }

  if (
    preflight.databaseStatus !== "validated"
    || !preflight.environment.stateValid
    || preflight.environment.propertyLifecycleState !== "draft"
    || preflight.environment.productionActive
    || preflight.environment.sandboxActive
    || preflight.certification.status !== "not_started"
  ) {
    throw new Error("PROOF_RUNNER_PREFLIGHT_NOT_READY");
  }

  return preflight;
}

export async function GET(req: NextRequest) {
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return response({ ok: false, error: "not_found" }, 404);
  }

  if (!hasValidOneTimeToken(req)) {
    return response({ ok: false, error: "not_found" }, 404);
  }

  try {
    await requireExactDisposableProofLineage();
    const action = String(req.nextUrl.searchParams.get("action") || "").trim().toLowerCase();
    const smokeRunId = String(req.nextUrl.searchParams.get("smokeRunId") || "").trim();

    if (action === "start") {
      const result = await startFactoryPreviewRuntimeSmoke(EXPECTED_ENVELOPE_ID);
      return response({ ok: true, proofOnly: true, ...result }, 200);
    }
    if (action === "settle") {
      const result = await settleFactoryPreviewRuntimeSmoke({
        envelopeProjectionRunId: EXPECTED_ENVELOPE_ID,
        smokeRunId,
      });
      return response({ ok: true, proofOnly: true, ...result }, result.state === "waiting" ? 202 : 200);
    }
    if (action === "status") {
      const result = await getFactoryPreviewRuntimeSmokeStatus({
        envelopeProjectionRunId: EXPECTED_ENVELOPE_ID,
        smokeRunId,
      });
      return response({ ok: true, proofOnly: true, ...result }, 200);
    }
    if (action === "certify") {
      const result = await certifyFactorySandboxFromTrustedEvidence({
        authority: PROOF_AUTHORITY,
        envelopeProjectionRunId: EXPECTED_ENVELOPE_ID,
        smokeRunId,
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
