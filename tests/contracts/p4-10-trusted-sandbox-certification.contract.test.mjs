import assert from "node:assert/strict";
import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("P4.10 certification route accepts lineage ids only and rejects caller evidence", async () => {
  const route = await readProjectFile("app/api/control-plane/onboarding/sandbox-certification/route.ts");

  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, 'new Set(["envelopeProjectionRunId", "smokeRunId"])');
  assertContains(route, '"checks" in body || "evidence" in body');
  assertContains(route, 'error: "client_evidence_not_accepted"');
  assertContains(route, "certifyFactorySandboxFromTrustedEvidence");
  assertNotContains(route, "checks: body.checks");
  assertNotContains(route, "evidence: body.evidence");
});

test("P4.10 derives every P2.5 certification check from trusted server evidence", async () => {
  const service = await readProjectFile("lib/server/factory-trusted-sandbox-certification.ts");

  assertContains(service, "getFactorySandboxPreflight");
  assertContains(service, "getFactoryReleaseEvidence");
  assertContains(service, "probeFactorySandboxGenericStaffRuntime");
  assertContains(service, "getFactoryPreviewRuntimeSmokeStatus");
  assertContains(service, "certifyFactorySandbox");
  assertContains(service, 'source: "system_derived"');

  for (const check of [
    "generic_staff_runtime",
    "tenant_isolation",
    "preview_build",
    "runtime_errors",
    "supabase_security",
    "integration_placeholders",
    "reporting_fail_closed",
    "branding_placeholder",
    "knowledge_placeholder",
  ]) {
    assertContains(service, `${check}: true`);
  }

  assertNotContains(service, "supabaseAdmin");
  assertNotContains(service, 'rpc("certify_factory_sandbox_v1"');
});

test("P4.10 requires exact Preview release lineage and a clean three-marker Drain window", async () => {
  const service = await readProjectFile("lib/server/factory-trusted-sandbox-certification.ts");

  assertContains(service, 'releaseEvidence.environment !== "preview"');
  assertContains(service, 'releaseEvidence.lineageMode !== "preview_self"');
  assertContains(service, 'releaseEvidence.releaseGate.state !== "validated"');
  assertContains(service, 'releaseEvidence.vercelPreview.state !== "validated"');
  assertContains(service, 'releaseEvidence.requiredChecks.tenant_isolation !== "validated"');
  assertContains(service, 'releaseEvidence.requiredChecks.preview_build !== "validated"');
  assertContains(service, 'observation.status !== "observed_clean"');
  assertContains(service, "Number(observation.errorCount) !== 0");
  assertContains(service, "Number(observation.markerCount) !== 3");
  assertContains(service, 'observation.evidenceSemantics !== "observed_drain_window_not_p2_5_validation"');
  assertContains(service, "smokeStatus.deploymentId !== releaseEvidence.runtimeDeploymentId");
});

test("P4.10 rechecks pre-certification state and current Generic Staff runtime before mutation", async () => {
  const service = await readProjectFile("lib/server/factory-trusted-sandbox-certification.ts");

  assertContains(service, 'preflight.databaseStatus !== "validated"');
  assertContains(service, "preflight.environment.productionActive");
  assertContains(service, "preflight.environment.sandboxActive");
  assertContains(service, 'preflight.certification.status !== "not_started"');
  assertContains(service, 'genericStaffRuntime.status !== "validated"');
  assertContains(service, "genericStaffRuntime.sandboxHotelId !== preflight.lineage.sandboxHotelId");
  assertContains(service, "genericStaffRuntime.sandboxRevisionId !== preflight.lineage.sandboxRevisionId");
});

test("P4.10 does not create smoke evidence, tenants, credentials, or a second certification authority", async () => {
  const service = await readProjectFile("lib/server/factory-trusted-sandbox-certification.ts");

  assertNotContains(service, "startFactoryPreviewRuntimeSmoke");
  assertNotContains(service, "settleFactoryPreviewRuntimeSmoke");
  assertNotContains(service, ".from(");
  assertNotContains(service, ".insert(");
  assertNotContains(service, ".update(");
  assertNotContains(service, "createClient");
  assert.ok(service.includes("certifyFactorySandbox({"), "existing P2.5 mutation service must remain the only bridge to the RPC");
});
