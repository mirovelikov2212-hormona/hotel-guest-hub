import assert from "node:assert/strict";
import test from "node:test";

import { prepareFactoryOnboardingEnvelope } from "../../lib/product-factory/factory-onboarding-envelope-model.mjs";
import { allInclusiveResortBlueprint, boutiqueHotelBlueprint } from "../fixtures/product-factory/p0-scenarios.mjs";
import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("P2.4 prepares a deterministic fail-closed onboarding envelope", () => {
  const result = prepareFactoryOnboardingEnvelope({ blueprint: structuredClone(allInclusiveResortBlueprint) });
  assert.match(result.envelopeHash, /^[a-f0-9]{64}$/);
  assert.equal(result.envelope.reporting.enabled, false);
  assert.deepEqual(result.envelope.reporting.recipients, []);
  assert.equal(result.envelope.branding.status, "placeholder");
  assert.equal(result.envelope.knowledge.status, "placeholder");
  assert.equal(result.envelope.ai_permissions.status, "pending");
  assert.ok(Object.values(result.envelope.ai_permissions.actions).every((value) => value === false));
  assert.equal(result.envelope.health.certification_status, "not_started");
  assert.equal(result.counts.reservedPublicIdentities, 2);
});

test("P2.4 creates role templates without staff credentials or runtime permissions", () => {
  const result = prepareFactoryOnboardingEnvelope({ blueprint: structuredClone(allInclusiveResortBlueprint) });
  const roles = result.envelope.role_templates;
  assert.ok(roles.some((role) => role.key === "hotel-admin"));
  assert.ok(roles.some((role) => role.key === "manager"));
  assert.ok(roles.some((role) => role.key === "department-pool" && role.department_code === "pool"));
  assert.ok(roles.every((role) => role.runtime_enabled === false));
  assert.ok(roles.every((role) => role.permissions_json.configured === false));
  assert.ok(roles.every((role) => role.permissions_json.permissions.length === 0));
});

test("P2.4 reserves isolated Production and Sandbox public/QR identities without activation", () => {
  const result = prepareFactoryOnboardingEnvelope({ blueprint: structuredClone(boutiqueHotelBlueprint) });
  const identities = result.envelope.public_identities;
  assert.equal(identities.production.guest_route, "/h/boutique-30");
  assert.equal(identities.production.qr_route, "/qr/boutique-30");
  assert.equal(identities.sandbox.guest_route, "/h/boutique-30-sandbox");
  assert.equal(identities.sandbox.status, "reserved");
  assert.notEqual(identities.production.public_slug, identities.sandbox.public_slug);
});

test("P2.4 schema is tenant-scoped and stores placeholders, never generated credentials", async () => {
  const migration = await readProjectFile("supabase/migrations/20260817111000_p2_4_onboarding_envelope_schema.sql");
  for (const table of [
    "hotel_role_templates","hotel_reporting_configs","hotel_branding_configs",
    "hotel_knowledge_configs","hotel_ai_permission_configs","hotel_public_identity_configs",
    "hotel_health_certification_state","factory_onboarding_envelope_projection_runs",
  ]) assertContains(migration, `public.${table}`);
  assertContains(migration, "runtime_enabled boolean not null default false");
  assertContains(migration, "status text not null default 'reserved'");
  assertContains(migration, "enable row level security");
  assertContains(migration, "grant select, insert");
  assertNotContains(migration.toLowerCase(), "pin_hash");
  assertNotContains(migration.toLowerCase(), "password_hash");
  assertNotContains(migration.toLowerCase(), "grant update");
  assertNotContains(migration.toLowerCase(), "grant delete");
});

test("P2.4 projection is exact-lineage idempotent and stays certification pending", async () => {
  const migration = await readProjectFile("supabase/migrations/20260817112500_p2_4_onboarding_envelope_projection.sql");
  assertContains(migration, "create or replace function public.project_factory_onboarding_envelope_v1");
  assertContains(migration, "pg_advisory_xact_lock");
  assertContains(migration, "P2_4_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "P2_4_ONBOARDING_STATE_NOT_FAIL_CLOSED");
  assertContains(migration, "FACTORY_SANDBOX_CERTIFICATION_PENDING");
  assertContains(migration, "P2_4_ONBOARDING_ENVELOPE_READY");
  assertContains(migration, "'reserved'");
  assertContains(migration, "'not_started'");
  assertContains(migration, "'factory_onboarding_envelope_projected'");
  assertContains(migration, "projection_status='pending'");
  assertNotContains(migration.toLowerCase(), "update public.hotels");
  assertNotContains(migration.toLowerCase(), "update public.properties");
  assertNotContains(migration.toLowerCase(), "insert into public.staff_users");
  assertNotContains(migration.toLowerCase(), "insert into public.staff_access_pins");
});

test("P2.4 Control Plane mutation is same-origin platform authority only", async () => {
  const service = await readProjectFile("lib/server/factory-onboarding-envelope.ts");
  const route = await readProjectFile("app/api/control-plane/onboarding/envelope/route.ts");
  assertContains(service, 'import "server-only"');
  assertContains(service, "canMutateControlPlane(input.authority.role)");
  assertContains(service, '"project_factory_onboarding_envelope_v1"');
  assertContains(service, "p_actor_admin_id: input.authority.adminId");
  assertNotContains(service, "manager_pin");
  assertNotContains(service, "staff_sessions");
  assertContains(route, "enforceControlPlaneSameOrigin(req)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "projectFactoryOnboardingEnvelope");
});
