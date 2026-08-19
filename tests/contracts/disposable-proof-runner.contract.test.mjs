import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const ROUTE = "app/api/factory-proof/runtime/route.ts";

test("disposable proof runner is exact-branch Preview-only and one-time-token gated", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'process.env.VERCEL_ENV !== "preview"');
  assertContains(source, 'process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH');
  assertContains(source, 'const EXPECTED_BRANCH = "proof-runner/disposable-e2e-20260819-0835"');
  assertContains(source, 'const PROOF_TOKEN_SHA256 = "992322135cc118e382372e23faa229361787610c378da0ea9a6c36e0cb2fd7be"');
  assertContains(source, 'req.nextUrl.searchParams.get("token")');
  assertContains(source, 'timingSafeEqual(suppliedDigest, expectedDigest)');
  assertNotContains(source, "VnJH9eb2hmazkDXI96rCZlU16ONc3p6JdrwQXtAaR1mm9qd_fKxQVqSRwHvZ-LR7");
});

test("proof runner is pinned to the exact disposable P2.4 lineage and pre-certification state", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'const EXPECTED_ENVELOPE_ID = "523e5f46-7871-4061-bf4d-115b555cfc98"');
  assertContains(source, 'const EXPECTED_ONBOARDING_RUN_ID = "c22be8f6-6cb0-4fd1-89a8-1489af42cb18"');
  assertContains(source, 'const EXPECTED_PRODUCTION_HOTEL_ID = "5db54dda-0a0e-4ece-88ad-91058fb888a1"');
  assertContains(source, 'const EXPECTED_SANDBOX_HOTEL_ID = "12206286-7a5a-4856-9610-4c75f0455202"');
  assertContains(source, 'const EXPECTED_PRODUCTION_REVISION_ID = "4341b8a3-5cc8-4006-a33c-68abe471ba62"');
  assertContains(source, 'const EXPECTED_SANDBOX_REVISION_ID = "9eaa845d-e7c8-47d9-8f55-80906f502a35"');
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

test("certification authority is fixed and the canonical RPC still rechecks active admin authority", async () => {
  const source = await readProjectFile(ROUTE);
  const certification = await readProjectFile("lib/server/factory-sandbox-certification.ts");

  assertContains(source, 'adminId: "edfcd3a6-c51a-4935-a70f-e4e477ec85ee"');
  assertContains(source, 'role: "super_admin"');
  assertContains(certification, "p_actor_admin_id: input.authority.adminId");
  assertContains(certification, 'rpc("certify_factory_sandbox_v1"');
});
