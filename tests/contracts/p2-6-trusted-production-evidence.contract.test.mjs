import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("Production release evidence supports exact squash-merge PR lineage", async () => {
  const source = await readProjectFile("lib/server/factory-release-evidence.ts");
  assertContains(source, '"production_squash_pr_head"');
  assertContains(source, '"/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100"');
  assertContains(source, "merge_commit_sha");
  assertContains(source, "runtimeGitSha");
  assertContains(source, "candidateGitSha");
  assertContains(source, "RELEASE_GATE_WORKFLOW");
  assertContains(source, "VERCEL_STATUS_CONTEXT");
});

test("Production runtime smoke emits the existing signed Vercel marker contract", async () => {
  const smoke = await readProjectFile("lib/server/factory-production-runtime-smoke.ts");
  assertContains(smoke, 'MARKER_PREFIX = "STAYHUB_FACTORY_SMOKE_V1:"');
  assertContains(smoke, 'MARKER_SCHEMA_VERSION = "p4.7-smoke-marker-v1"');
  assertContains(smoke, "SETTLE_DELAY_MS = 61_000");
  assertContains(smoke, 'evidence.environment !== "production"');
  assertContains(smoke, "probeFactorySandboxGenericStaffRuntimeByLineage");
  assertContains(smoke, "factory_production_runtime_certification_runs");
  assertContains(smoke, 'emitMarker(identity, candidate, "start")');
  assertContains(smoke, 'emitMarker(identity, candidate, "end")');
  assertContains(smoke, 'emitMarker(identity, candidate, "settle")');
  assertNotContains(smoke, '.update(');
  assertNotContains(smoke, '.insert(');
});

test("Production runtime smoke cron is authenticated and becomes idle after certification", async () => {
  const route = await readProjectFile("app/api/cron/factory-production-runtime-smoke/route.ts");
  const vercel = await readProjectFile("vercel.json");
  assertContains(route, "CRON_SECRET");
  assertContains(route, 'req.headers.get("x-vercel-cron") === "1"');
  assertContains(route, "runFactoryProductionRuntimeSmoke");
  assertContains(route, "maxDuration = 90");
  assertContains(vercel, '"path": "/api/cron/factory-production-runtime-smoke"');
  assertContains(vercel, '"schedule": "*/5 * * * *"');
});
