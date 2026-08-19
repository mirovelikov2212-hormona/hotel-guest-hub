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

function runnerPageResponse() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>StayHub Disposable P2.5 Proof</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #101010; color: #f5f5f5; }
    main { max-width: 760px; margin: 48px auto; padding: 24px; }
    section { border: 1px solid #333; border-radius: 18px; padding: 24px; background: #171717; }
    h1 { margin-top: 0; font-size: 28px; }
    p { color: #bbb; line-height: 1.55; }
    #state { font-weight: 700; color: #7dd3fc; }
    #result { white-space: pre-wrap; overflow-wrap: anywhere; background: #0b0b0b; border-radius: 12px; padding: 16px; min-height: 96px; color: #d4d4d4; }
    .ok { color: #6ee7b7 !important; }
    .error { color: #fda4af !important; }
  </style>
</head>
<body>
<main>
  <section>
    <h1>StayHub Disposable P2.5 Proof</h1>
    <p>This Preview-only page runs the exact pinned P4.8 smoke window and then the canonical trusted P2.5 certification. Production is never activated.</p>
    <p id="state">Preparing exact-lineage proof…</p>
    <pre id="result">Do not close this tab until the result is shown.</pre>
  </section>
</main>
<script>
(() => {
  const state = document.getElementById('state');
  const result = document.getElementById('result');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function show(message, payload) {
    state.textContent = message;
    if (payload !== undefined) result.textContent = JSON.stringify(payload, null, 2);
  }

  async function call(action, smokeRunId) {
    let url = location.pathname + '?action=' + encodeURIComponent(action);
    if (smokeRunId) url += '&smokeRunId=' + encodeURIComponent(smokeRunId);
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error('NON_JSON_RESPONSE_' + res.status); }
    if (!res.ok) throw new Error(String(body.error || ('HTTP_' + res.status)));
    return body;
  }

  async function run() {
    show('Starting canonical P4.8 Preview smoke…');
    const started = await call('start');
    const smokeRunId = String(started.smokeRunId || '');
    if (!smokeRunId) throw new Error('SMOKE_RUN_ID_MISSING');
    show('Smoke started. Waiting for the 60+ second clean observation window…', { smokeRunId });

    let settled = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const settlement = await call('settle', smokeRunId);
      if (settlement.state === 'settle_emitted' || settlement.state === 'already_emitted') {
        settled = true;
        break;
      }
      if (settlement.state !== 'waiting') throw new Error('UNEXPECTED_SETTLE_STATE_' + String(settlement.state || ''));
      const retry = Number(settlement.retryAfterMs || 5000);
      await wait(Math.min(15000, Math.max(2000, retry)));
    }
    if (!settled) throw new Error('SMOKE_SETTLE_TIMEOUT');

    show('Settle marker emitted. Waiting for trusted Vercel runtime attestation…', { smokeRunId });
    let clean = false;
    let lastObservation = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = await call('status', smokeRunId);
      lastObservation = status.observation || null;
      const observationStatus = String((status.observation && status.observation.status) || '');
      if (observationStatus === 'observed_clean') {
        clean = true;
        break;
      }
      if (observationStatus === 'observed_errors' || observationStatus === 'failed') {
        throw new Error('RUNTIME_OBSERVATION_' + observationStatus.toUpperCase());
      }
      await wait(5000);
    }
    if (!clean) throw new Error('CLEAN_OBSERVATION_TIMEOUT');

    show('Runtime window is clean. Running canonical P2.5 certification…', { smokeRunId, observation: lastObservation });
    const certification = await call('certify', smokeRunId);
    state.textContent = 'P2.5 CERTIFIED — Sandbox is active; Production remains inactive.';
    state.className = 'ok';
    result.textContent = JSON.stringify({ smokeRunId, certification }, null, 2);
  }

  run().catch((error) => {
    state.textContent = 'PROOF STOPPED FAIL-CLOSED';
    state.className = 'error';
    result.textContent = String(error && error.message ? error.message : error);
  });
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
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

  try {
    await requireExactDisposableProofLineage();
    const action = String(req.nextUrl.searchParams.get("action") || "").trim().toLowerCase();
    const smokeRunId = String(req.nextUrl.searchParams.get("smokeRunId") || "").trim();

    if (action === "run") {
      return runnerPageResponse();
    }
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
