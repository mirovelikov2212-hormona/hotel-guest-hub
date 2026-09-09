import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const FILES = {
  readModel: "lib/server/factory-production-version-management.ts",
  actions: "lib/server/factory-production-version-management-actions.ts",
  route: "app/api/control-plane/onboarding/version-management/route.ts",
  panel: "app/control-plane/factory/runs/[onboardingRunId]/FactoryVersionManagementPanel.tsx",
  page: "app/control-plane/factory/runs/[onboardingRunId]/page.tsx",
};

test("CM4 read model exposes current LIVE, candidates, history, diff and audit timeline", async () => {
  const source = await read(FILES.readModel);
  assert.match(source, /currentLive: FactoryVersionRevisionSummary/);
  assert.match(source, /candidates: FactoryVersionRevisionSummary\[\]/);
  assert.match(source, /history: FactoryVersionRevisionSummary\[\]/);
  assert.match(source, /timeline: FactoryVersionTimelineEntry\[\]/);
  assert.match(source, /buildHotelConfigVersionDiff\(input\.currentConfig, input\.row\.config_json\)/);
  assert.match(source, /published_revision_id,last_known_good_revision_id/);
  assert.match(source, /CM4_CURRENT_LIVE_LKG_MISMATCH/);
});

test("CM4 read model fails soft to migration_required when CM schema is not deployed", async () => {
  const source = await read(FILES.readModel);
  assert.match(source, /capability: "ready" \| "migration_required"/);
  assert.match(source, /isMissingCmSchema/);
  assert.match(source, /capability = "migration_required"/);
  assert.match(source, /factory_production_readiness_runs/);
});

test("CM4 write dispatcher accepts only locator/reason/confirmation and delegates to CM1/CM3 authorities", async () => {
  const source = await read(FILES.actions);
  assert.match(source, /locator: unknown/);
  assert.match(source, /confirmed: unknown/);
  assert.match(source, /CM4_EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.match(source, /assessFactoryProductionVersionReadiness/);
  assert.match(source, /publishFactoryProductionVersionCandidate/);
  assert.match(source, /certifyFactoryProductionVersionCandidate/);
  assert.match(source, /activateFactoryProductionVersionCandidate/);
  assert.match(source, /assessFactoryProductionHistoricalRestoreReadiness/);
  assert.match(source, /activateFactoryProductionHistoricalRestore/);
  assert.doesNotMatch(source, /productionHotelId: input\./);
  assert.doesNotMatch(source, /deploymentSha: input\./);
  assert.doesNotMatch(source, /projection: input\./);
});

test("CM4 approval objects are server-owned and preserve certification/CAS invariants", async () => {
  const source = await read(FILES.actions);
  assert.match(source, /preserveCurrentLive: true/);
  assert.match(source, /requireRuntimeCertification: true/);
  assert.match(source, /expectedCurrentLiveCas: true/);
  assert.match(source, /atomicProjectionCutover: true/);
  assert.match(source, /retainRevisionHistory: true/);
  assert.match(source, /requireRuntimeRecertification: true/);
});

test("CM4 route is authenticated, same-origin for writes, bounded and role-gated", async () => {
  const source = await read(FILES.route);
  assert.match(source, /getCurrentPlatformAdminSession/);
  assert.match(source, /enforceControlPlaneSameOrigin\(req\)/);
  assert.match(source, /canMutateControlPlane\(authority\.role\)/);
  assert.match(source, /MAX_BODY_BYTES = 16_384/);
  assert.match(source, /payload_too_large/);
  assert.match(source, /ACTIONS = new Set<FactoryVersionManagementAction>/);
  assert.match(source, /body\.confirmed !== true/);
});

test("CM4 route maps concurrent LIVE drift and undeployed migrations fail-closed", async () => {
  const source = await read(FILES.route);
  assert.match(source, /stale_live_revision/);
  assert.match(source, /change_management_migration_required/);
  assert.match(source, /production_release_not_certified/);
  assert.match(source, /version_management_gate_failed/);
});

test("CM4 UI keeps migrations/read-only roles locked and requires explicit activation phrases", async () => {
  const source = await read(FILES.panel);
  assert.match(source, /snapshot\.capability !== "ready"/);
  assert.match(source, /!snapshot\.canMutate/);
  assert.match(source, /window\.prompt\(promptText\)/);
  assert.match(source, /restore \? "RESTORE" : "LIVE"/);
  assert.match(source, /window\.confirm\(copy\.confirm\)/);
  assert.match(source, /change_management_migration_required/);
});

test("CM4 Factory page exposes version management only for an active Production hotel", async () => {
  const source = await read(FILES.page);
  assert.match(source, /progress\.production\.active\s*\?\s*await getFactoryProductionVersionManagementSnapshot/);
  assert.match(source, /productionHotelId: progress\.production\.hotelId/);
  assert.match(source, /<FactoryVersionManagementPanel/);
  assert.match(source, /initialSnapshot=\{versionManagementSnapshot\}/);
});
