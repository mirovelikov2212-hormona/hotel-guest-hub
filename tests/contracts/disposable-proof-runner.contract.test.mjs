import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const ROUTE = "app/api/factory-proof/runtime/route.ts";

test("disposable proof runner is Preview-only and reserved to proof lineage", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'process.env.VERCEL_ENV !== "preview"');
  assertContains(source, 'startsWith("proof:")');
  assertContains(source, 'startsWith("proof-")');
  assertContains(source, 'String(property.lifecycle_state || "") !== "draft"');
  assertContains(source, "production.active === true");
  assertContains(source, "production.is_sandbox === true");
  assertContains(source, "production.is_demo === true");
  assertContains(source, "sandbox.is_sandbox !== true");
  assertContains(source, "String(sandbox.production_hotel_id || \"\") !== String(production.id)");
});

test("proof runner invokes canonical P4.8/P4.10 trusted helpers and no direct certification RPC", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, "startFactoryPreviewRuntimeSmoke(envelopeProjectionRunId)");
  assertContains(source, "settleFactoryPreviewRuntimeSmoke({");
  assertContains(source, "getFactoryPreviewRuntimeSmokeStatus({");
  assertContains(source, "certifyFactorySandboxFromTrustedEvidence({");
  assertContains(source, "enforceControlPlaneSameOrigin(req)");
  assertNotContains(source, 'rpc("certify_factory_sandbox_v1"');
  assertNotContains(source, "factory_production_readiness_runs");
  assertNotContains(source, "factory_production_publication_runs");
  assertNotContains(source, "factory_production_live_activation_runs");
});

test("proof runner requires an active mutation-authorized platform admin", async () => {
  const source = await readProjectFile(ROUTE);

  assertContains(source, 'new Set<PlatformAdminRole>(["super_admin", "operator"])');
  assertContains(source, '.from("platform_admins")');
  assertContains(source, '.eq("active", true)');
  assertContains(source, "if (!MUTATING_ROLES.has(role))");
});
