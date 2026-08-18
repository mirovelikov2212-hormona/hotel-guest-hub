import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("P4.11 wires the guided certification workspace only after trusted preflight evidence exists", async () => {
  const page = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/page.tsx");

  assertContains(page, "FactorySandboxCertificationPanel");
  assertContains(page, 'preflight?.databaseStatus === "validated"');
  assertContains(page, "runtimeProbe={trustedEvidence[0]}");
  assertContains(page, "releaseEvidence={trustedEvidence[1]}");
  assertContains(page, "P4.4 → P4.11 · Guided Factory Progress");
});

test("P4.11 runs only the existing P4.8 start-settle-status smoke lifecycle", async () => {
  const panel = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCertificationPanel.tsx");

  assertContains(panel, '"/api/control-plane/onboarding/sandbox-runtime-smoke"');
  assertContains(panel, '{ action: "start", envelopeProjectionRunId }');
  assertContains(panel, '{ action: "settle", envelopeProjectionRunId, smokeRunId: id }');
  assertContains(panel, '{ action: "status", envelopeProjectionRunId, smokeRunId: id }');
  assertContains(panel, 'result.observation?.status === "observed_clean"');
  assertContains(panel, 'result.observation?.status === "failed"');
  assertNotContains(panel, "factory_vercel_runtime_log_events");
  assertNotContains(panel, "STAYHUB_FACTORY_SMOKE_V1");
});

test("P4.11 keeps Sandbox certification Preview-only and requires explicit operator confirmation", async () => {
  const panel = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCertificationPanel.tsx");

  assertContains(panel, 'releaseEvidence.environment === "preview"');
  assertContains(panel, 'releaseEvidence.lineageMode === "preview_self"');
  assertContains(panel, 'preflight.certification.status === "not_started"');
  assertContains(panel, "preflight.environment.productionActive === false");
  assertContains(panel, "preflight.environment.sandboxActive === false");
  assertContains(panel, 'type="checkbox"');
  assertContains(panel, "disabled={!confirmed || busy}");
  assertContains(panel, "onClick={certifySandbox}");
  assertContains(panel, 'releaseEvidence.environment === "production" ? copy.prodBlocked');
});

test("P4.11 certification sends lineage pointers only and cannot recreate manual evidence booleans", async () => {
  const panel = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCertificationPanel.tsx");

  assertContains(panel, '"/api/control-plane/onboarding/sandbox-certification"');
  assertContains(panel, "{ envelopeProjectionRunId, smokeRunId }");
  assertNotContains(panel, "checks:");
  assertNotContains(panel, "evidence:");
  assertNotContains(panel, "runtime_errors: true");
  assertNotContains(panel, "generic_staff_runtime: true");
});

test("P4.11 stores only the smoke pointer for resume and never auto-certifies on mount", async () => {
  const panel = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCertificationPanel.tsx");

  assertContains(panel, "window.sessionStorage.setItem(storageKey, result.smokeRunId)");
  assertContains(panel, "window.sessionStorage.getItem(storageKey)");
  assertContains(panel, "window.sessionStorage.removeItem(storageKey)");
  assertNotContains(panel, "window.localStorage");
  assertNotContains(panel, "useEffect(() => {\n    certifySandbox");
});

test("P4.11 evidence copy reflects the live signed Drain instead of the obsolete no-attestation message", async () => {
  const panel = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxEvidencePanel.tsx");

  assertContains(panel, "Реалният Vercel Drain е активен");
  assertContains(panel, "tenant-specific runtime evidence");
  assertNotContains(panel, "No trusted Vercel log attestation is available");
  assertNotContains(panel, "Няма trusted Vercel log attestation");
});

test("P4.11 never invokes Production readiness, publication, runtime certification or LIVE activation", async () => {
  const panel = await readProjectFile("app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxCertificationPanel.tsx");

  for (const forbidden of [
    "production-readiness",
    "production-publication",
    "production-runtime-certification",
    "production-live-activation",
    "production-live-rollback",
  ]) {
    assertNotContains(panel, forbidden);
  }
});
