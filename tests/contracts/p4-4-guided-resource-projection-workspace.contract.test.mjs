import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../../supabase/migrations/20260818050000_p4_4_factory_progress_read.sql", import.meta.url);
const helperPath = new URL("../../lib/server/factory-onboarding-progress.ts", import.meta.url);
const listPagePath = new URL("../../app/control-plane/factory/runs/page.tsx", import.meta.url);
const detailPagePath = new URL("../../app/control-plane/factory/runs/[onboardingRunId]/page.tsx", import.meta.url);
const workspacePath = new URL("../../app/control-plane/factory/runs/[onboardingRunId]/FactoryProjectionWorkspace.tsx", import.meta.url);
const newPagePath = new URL("../../app/control-plane/factory/new/page.tsx", import.meta.url);

const [migration, helper, listPage, detailPage, workspace, newPage] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(listPagePath, "utf8"),
  readFile(detailPagePath, "utf8"),
  readFile(workspacePath, "utf8"),
  readFile(newPagePath, "utf8"),
]);

test("P4.4 progress RPC is service-role-only, stable, fixed-search-path and read-only", () => {
  assert.match(migration, /create or replace function public\.get_factory_onboarding_progress_v1/);
  assert.match(migration, /security definer/);
  assert.match(migration, /stable/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on function public\.get_factory_onboarding_progress_v1\(uuid, integer\) from anon/);
  assert.match(migration, /from authenticated/);
  assert.match(migration, /grant execute on function public\.get_factory_onboarding_progress_v1\(uuid, integer\) to service_role/);
  assert.doesNotMatch(migration.toLowerCase(), /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/);
});

test("P4.4 reconstructs the unique P2.1→P2.4 predecessor lineage", () => {
  assert.match(migration, /factory_onboarding_runs/);
  assert.match(migration, /c\.onboarding_run_id = o\.id/);
  assert.match(migration, /op\.core_projection_run_id = c\.id/);
  assert.match(migration, /env\.operational_projection_run_id = op\.id/);
  assert.match(migration, /c\.status = 'completed'/);
  assert.match(migration, /op\.status = 'completed'/);
  assert.match(migration, /env\.status = 'completed'/);
});

test("P4.4 returns authoritative P2.1 blueprint and real fail-closed property/hotel state", () => {
  assert.match(migration, /'blueprint', o\.blueprint_json/);
  assert.match(migration, /'lifecycleState', p\.lifecycle_state/);
  assert.match(migration, /'active', prod\.active/);
  assert.match(migration, /'active', sb\.active/);
  assert.match(migration, /'nextStage'/);
});

test("P4.4 server helper uses one reviewed progress RPC for both list and detail", () => {
  assert.match(helper, /supabaseAdmin\.rpc\(/);
  assert.match(helper, /"get_factory_onboarding_progress_v1"/);
  assert.equal((helper.match(/supabaseAdmin\.rpc\(/g) || []).length, 1);
  assert.match(helper, /listFactoryOnboardingRuns/);
  assert.match(helper, /getFactoryOnboardingProgress/);
  assert.match(helper, /UUID_PATTERN/);
});

test("P4.4 list and detail pages require Platform Admin session and preserve BG/EN", () => {
  assert.match(listPage, /getCurrentPlatformAdminSession/);
  assert.match(detailPage, /getCurrentPlatformAdminSession/);
  assert.match(listPage, /redirect\(`\/control-plane\/login\?lang=\$\{lang\}`\)/);
  assert.match(detailPage, /redirect\(`\/control-plane\/login\?lang=\$\{lang\}`\)/);
  assert.match(listPage, /factory\/runs\?lang=bg/);
  assert.match(detailPage, /\?lang=bg/);
  assert.match(detailPage, /\?lang=en/);
});

test("P4.4 workspace uses immutable stored blueprint and exact predecessor IDs", () => {
  assert.match(workspace, /progress\.blueprint/);
  assert.match(workspace, /onboardingRunId: progress\.onboardingRunId/);
  assert.match(workspace, /coreProjectionRunId: progress\.core\?\.projectionRunId/);
  assert.match(workspace, /operationalProjectionRunId: progress\.operational\?\.projectionRunId/);
});

test("P4.4 calls only the existing P2.2/P2.3/P2.4 projection endpoints", () => {
  assert.match(workspace, /\/api\/control-plane\/onboarding\/core-resources/);
  assert.match(workspace, /\/api\/control-plane\/onboarding\/operational-resources/);
  assert.match(workspace, /\/api\/control-plane\/onboarding\/envelope/);
  assert.doesNotMatch(workspace, /sandbox-certification|production-publication|production-live-activation|commercial\/property-lifecycle/);
});

test("P4.4 never auto-chains projection stages", () => {
  assert.doesNotMatch(workspace, /Promise\.all/);
  assert.doesNotMatch(workspace, /runStage\("core"\).*runStage\("operational"\)/s);
  assert.match(workspace, /router\.refresh\(\)/);
  assert.match(workspace, /P4\.4 спира тук|P4\.4 stops here/);
});

test("P4.4 blocks projection actions if actual foundation state is no longer fail-closed", () => {
  assert.match(workspace, /progress\.property\.lifecycleState === "draft"/);
  assert.match(workspace, /progress\.production\.active === false/);
  assert.match(workspace, /progress\.sandbox\.active === false/);
  assert.match(workspace, /disabled=\{Boolean\(running\) \|\| !failClosed\}/);
});

test("P4.4 keeps resource projections fail-closed in operator copy", () => {
  assert.match(workspace, /Runtime is not activated/);
  assert.match(workspace, /All execution flags remain disabled/);
  assert.match(workspace, /Production remains inactive/);
  assert.match(workspace, /Не активира runtime/);
});

test("P4.4 Factory runs are discoverable from the new-hotel workspace", () => {
  assert.match(newPage, /\/control-plane\/factory\/runs\?lang=\$\{lang\}/);
  assert.match(newPage, /Factory runs/);
});

test("P4.4 list is bounded and does not expose credential material", () => {
  assert.match(migration, /least\(coalesce\(p_limit, 50\), 100\)/);
  assert.match(helper, /Math\.max\(1, Math\.min\(limit, 100\)\)/);
  assert.doesNotMatch(migration + helper + listPage + detailPage + workspace, /password_hash|api_key|access_token|client_secret/i);
});
