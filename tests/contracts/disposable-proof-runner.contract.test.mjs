import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const ROUTE = "app/api/factory-proof/runtime/route.ts";

test("disposable proof runner is exact-branch Preview-only behind Vercel Deployment Protection", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'process.env.VERCEL_ENV !== "preview"');
  assertContains(source, 'process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH');
  assertContains(source, 'const EXPECTED_BRANCH = "proof-runner/disposable-e2e-20260819-0835"');
  assertNotContains(source, "PROOF_TOKEN_SHA256");
  assertNotContains(source, 'searchParams.get("token")');
});

test("proof runner is pinned to the authoritative disposable P2.4 lineage and pre-certification state", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'const EXPECTED_ENVELOPE_ID = "523e5f46-7871-4061-bf4d-115b555cfc98"');
  assertContains(source, 'const EXPECTED_ONBOARDING_RUN_ID = "c22be8f6-6cb0-4fd1-89a8-1489af42cb18"');
  assertContains(source, 'const EXPECTED_PRODUCTION_HOTEL_ID = "2fe51e8f-4ae8-4ac3-a96b-d97f3cee62ed"');
  assertContains(source, 'const EXPECTED_SANDBOX_HOTEL_ID = "88be3201-6306-45df-835f-18916f70c832"');
  assertContains(source, 'const EXPECTED_PRODUCTION_REVISION_ID = "f41dd750-6e61-48d7-b544-75b859189f57"');
  assertContains(source, 'const EXPECTED_SANDBOX_REVISION_ID = "adac0791-466e-4ecf-99fc-9c0c5c1552eb"');
  assertContains(source, 'preflight.databaseStatus !== "validated"');
  assertContains(source, 'preflight.environment.propertyLifecycleState !== "draft"');
  assertContains(source, "preflight.environment.productionActive");
  assertContains(source, "preflight.environment.sandboxActive");
  assertContains(source, 'preflight.certification.status !== "not_started"');
});

test("proof runner invokes canonical P4.8/P4.10 helpers with no direct Supabase or P2.6 mutation path", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, "startFactoryPreviewRuntimeSmoke(EXPECTED_ENVELOPE_ID)");
  assertContains(source, "settleFactoryPreviewRuntimeSmoke({");
  assertContains(source, "getFactoryPreviewRuntimeSmokeStatus({");
  assertContains(source, "certifyFactorySandboxFromTrustedEvidence({");
  assertNotContains(source, "supabaseAdmin");
  assertNotContains(source, '.from("');
  assertNotContains(source, '.rpc("');
  assertNotContains(source, "factory_production_readiness_runs");
  assertNotContains(source, "factory_production_publication_runs");
  assertNotContains(source, "factory_production_live_activation_runs");
});

test("one-click browser orchestrator stays same-origin and can only sequence canonical proof actions", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'if (action === "run")');
  assertContains(source, "credentials: 'same-origin'");
  assertContains(source, "await call('start')");
  assertContains(source, "await call('settle', smokeRunId)");
  assertContains(source, "await call('status', smokeRunId)");
  assertContains(source, "await call('certify', smokeRunId)");
  assertContains(source, "P2.5 CERTIFIED — Sandbox is active; Production remains inactive.");
  assertNotContains(source, "localStorage");
  assertNotContains(source, "sessionStorage");
});

test("certification authority is fixed and the canonical RPC still rechecks active admin authority", async () => {
  const source = await readProjectFile(ROUTE);
  const certification = await readProjectFile("lib/server/factory-sandbox-certification.ts");

  assertContains(source, 'adminId: "edfcd3a6-c51a-4935-a70f-e4e477ec85ee"');
  assertContains(source, 'role: "super_admin"');
  assertContains(certification, "p_actor_admin_id: input.authority.adminId");
  assertContains(certification, 'rpc("certify_factory_sandbox_v1"');
});
