import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../../supabase/migrations/20260818101500_p4_5_factory_sandbox_preflight_read.sql", import.meta.url);
const helperPath = new URL("../../lib/server/factory-sandbox-preflight.ts", import.meta.url);
const pagePath = new URL("../../app/control-plane/factory/runs/[onboardingRunId]/page.tsx", import.meta.url);
const panelPath = new URL("../../app/control-plane/factory/runs/[onboardingRunId]/FactorySandboxPreflightPanel.tsx", import.meta.url);
const docsPath = new URL("../../docs/P4.5-SANDBOX-CERTIFICATION-PREFLIGHT.md", import.meta.url);
const guardPath = new URL("../../scripts/tenant-isolation-guard.mjs", import.meta.url);

const [migration, helper, page, panel, docs, guard] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(pagePath, "utf8"),
  readFile(panelPath, "utf8"),
  readFile(docsPath, "utf8"),
  readFile(guardPath, "utf8"),
]);

const REQUIRED_CHECKS = [
  "generic_staff_runtime",
  "tenant_isolation",
  "preview_build",
  "runtime_errors",
  "supabase_security",
  "integration_placeholders",
  "reporting_fail_closed",
  "branding_placeholder",
  "knowledge_placeholder",
];

test("P4.5 preflight RPC is service-role-only, stable, fixed-search-path and read-only", () => {
  assert.match(migration, /create or replace function public\.get_factory_sandbox_preflight_v1/);
  assert.match(migration, /security definer/);
  assert.match(migration, /stable/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /grant execute on function public\.get_factory_sandbox_preflight_v1\(uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.get_factory_sandbox_preflight_v1\(uuid\) from anon/);
  assert.match(migration, /from authenticated/);
  assert.doesNotMatch(migration.toLowerCase(), /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/);
});

test("P4.5 reconstructs exact P2.1→P2.4 lineage and distinguishes pre/post-cert Sandbox state", () => {
  for (const fragment of [
    "factory_onboarding_envelope_projection_runs",
    "factory_operational_resource_projection_runs",
    "factory_core_resource_projection_runs",
    "factory_onboarding_runs",
    "factory_sandbox_certification_runs",
    "env.status = 'completed'",
    "op.status = 'completed'",
    "c.status = 'completed'",
    "o.status = 'completed'",
    "not v_certified and v.sandbox_active = false",
    "v_certified and v.sandbox_active = true",
    "v.production_active = false",
  ]) assert.match(migration, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("P4.5 derives the current P2.5 database gates instead of accepting operator booleans", () => {
  for (const fragment of [
    "hotel_role_templates",
    "runtime_enabled = false",
    "hotel_service_definitions",
    "hotel_workflow_definitions",
    "routing_rules",
    "hotel_integration_configs",
    "hotel_reporting_configs",
    "hotel_branding_configs",
    "hotel_knowledge_configs",
    "hotel_ai_permission_configs",
    "hotel_public_identity_configs",
    "hotel_health_certification_state",
    "factory_sandbox_certification_runs",
    "certify_factory_sandbox_v1",
  ]) assert.match(migration, new RegExp(fragment));

  for (const check of REQUIRED_CHECKS) {
    assert.match(migration, new RegExp(`'${check}'`));
    assert.match(panel, new RegExp(check));
  }
});

test("P4.5 keeps external runtime/build evidence pending until system evidence exists", () => {
  for (const check of ["generic_staff_runtime", "tenant_isolation", "preview_build", "runtime_errors"]) {
    assert.match(migration, new RegExp(check));
  }
  assert.match(migration, /'externalEvidenceRequired'/);
  assert.match(migration, /'certificationMutationAvailable', false/);
  assert.match(panel, /не може да ги маркира ръчно|cannot mark them as passed manually/);
  assert.match(docs, /operator does not submit these as checkboxes/);
});

test("P4.5 helper performs one exact service-role RPC read and validates the returned lineage ID", () => {
  assert.equal((helper.match(/supabaseAdmin\.rpc\(/g) || []).length, 1);
  assert.match(helper, /"get_factory_sandbox_preflight_v1"/);
  assert.match(helper, /UUID_PATTERN/);
  assert.match(helper, /preflight\.schemaVersion !== "p2\.5-preflight-v1"/);
  assert.match(helper, /String\(preflight\.envelopeProjectionRunId\) !== normalized/);
});

test("P4.5 Factory detail page reads preflight only after an envelope exists", () => {
  assert.match(page, /progress\.envelope/);
  assert.match(page, /getFactorySandboxPreflight\(progress\.envelope\.projectionRunId\)/);
  assert.match(page, /FactorySandboxPreflightPanel/);
});

test("P4.5 UI is status-only and contains no certification mutation", () => {
  assert.doesNotMatch(panel, /fetch\(|POST|sandbox-certification|certifyFactorySandbox/);
  assert.match(panel, /preflight\.databaseStatus/);
  assert.match(panel, /preflight\.evidenceStatus/);
  assert.match(panel, /preflight\.certification\.status/);
});

test("P4.5 tenant-isolation audit is chained after P4.4", () => {
  assert.match(guard, /tenant-isolation-baseline-p4-4-guided-resource-projection-workspace\.json/);
  assert.match(guard, /tenant-isolation-baseline-p4-5-sandbox-preflight\.json/);
});
