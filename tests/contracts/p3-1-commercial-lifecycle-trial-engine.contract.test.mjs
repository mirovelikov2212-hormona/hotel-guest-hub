import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const migration = await readFile(
  resolve(root, "supabase/migrations/20260817180000_p3_1_commercial_lifecycle_trial_engine.sql"),
  "utf8",
);
const service = await readFile(resolve(root, "lib/server/property-commercial-lifecycle.ts"), "utf8");
const route = await readFile(
  resolve(root, "app/api/control-plane/commercial/property-lifecycle/route.ts"),
  "utf8",
);
const registry = await readFile(resolve(root, "lib/server/control-plane-registry.ts"), "utf8");
const page = await readFile(resolve(root, "app/control-plane/page.tsx"), "utf8");
const migrationBeforeRpc = migration.split("create or replace function")[0];

test("P3.1 creates separate commercial state and immutable lifecycle event tables", () => {
  assert.match(migration, /create table public\.property_commercial_state/i);
  assert.match(migration, /create table public\.property_commercial_lifecycle_events/i);
  assert.match(migration, /request_id uuid not null unique/i);
  assert.match(migration, /request_hash text not null unique/i);
  assert.match(migration, /version bigint not null default 1/i);
});

test("P3.1 commercial state machine contains the approved statuses and actions", () => {
  for (const status of ["pending", "trial", "active_customer", "suspended", "ended"]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  for (const action of [
    "initialize",
    "start_trial",
    "extend_trial",
    "convert_to_customer",
    "suspend",
    "resume",
    "end",
  ]) {
    assert.match(migration, new RegExp(`'${action}'`));
    assert.match(service, new RegExp(`"${action}"`));
  }
});

test("P3.1 does not backfill or mutate existing technical tenants", () => {
  assert.doesNotMatch(migrationBeforeRpc, /insert\s+into\s+public\.property_commercial_state/i);
  assert.doesNotMatch(migration, /update\s+public\.hotels/i);
  assert.doesNotMatch(migration, /update\s+public\.properties/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.hotels/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.properties/i);
});

test("P3.1 requires live Production before granting trial/customer/resume access", () => {
  assert.match(migration, /p_action in \('start_trial','convert_to_customer','resume'\)/i);
  assert.match(migration, /pe\.environment = 'production'/i);
  assert.match(migration, /h\.active = true/i);
  assert.match(migration, /h\.is_sandbox = false/i);
  assert.match(migration, /h\.is_demo = false/i);
  assert.match(migration, /P3_1_PRODUCTION_NOT_LIVE/);
});

test("P3.1 trial windows are bounded and expiry is derived without a cron mutation", () => {
  assert.match(migration, /p_trial_days < 1 or p_trial_days > 60/i);
  assert.match(migration, /interval '180 days'/i);
  assert.match(service, /trialEnd > now\.getTime\(\)/);
  assert.match(service, /effectiveStatus: "trial_expired"/);
  assert.doesNotMatch(service, /cron/i);
});

test("P3.1 uses optimistic concurrency and strict idempotency replay", () => {
  assert.match(migration, /p_expected_version <> v_state\.version/i);
  assert.match(migration, /P3_1_VERSION_CONFLICT/);
  assert.match(migration, /where pcle\.request_id = p_request_id/i);
  assert.match(migration, /P3_1_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /P3_1_REPLAY_STATE_DRIFT/);
  assert.match(service, /createHash\("sha256"\)/);
});

test("P3.1 privileged database code is service-role-only with fixed search_path and RLS", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /revoke all on function public\.transition_property_commercial_lifecycle_v1[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.transition_property_commercial_lifecycle_v1[\s\S]*to service_role/i,
  );
});

test("P3.1 server mutation requires Control Plane mutation authority and one exact property RPC", () => {
  assert.match(service, /canMutateControlPlane\(input\.authority\.role\)/);
  assert.match(service, /P3_1_FACTORY_ADMIN_FORBIDDEN/);
  assert.match(service, /\.rpc\("transition_property_commercial_lifecycle_v1"/);
  assert.match(service, /p_property_id: propertyId/);
  assert.match(service, /p_actor_admin_id: input\.authority\.adminId/);
});

test("P3.1 API is same-origin, authenticated, bounded and POST-only", () => {
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/);
  assert.match(route, /MAX_BODY_BYTES = 65_536/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /Cache-Control": "no-store/);
});

test("P3.1 commercial conversion preserves the tenant and only changes commercial authority", () => {
  assert.match(migration, /status = 'active_customer'/i);
  assert.match(migration, /contract_started_at = coalesce\(pcs\.contract_started_at, v_now\)/i);
  assert.doesNotMatch(service, /hotels"\)\.update/i);
  assert.doesNotMatch(service, /properties"\)\.update/i);
});

test("P3.1 Control Plane read model is legacy-safe and shows commercial metrics", () => {
  assert.match(registry, /status: "unmanaged"/);
  assert.match(registry, /\.from\("property_commercial_state"\)/);
  assert.match(registry, /commercialManagedCount/);
  assert.match(registry, /activeTrialCount/);
  assert.match(registry, /activeCustomerCount/);
  assert.match(page, /UNMANAGED \/ LEGACY/);
  assert.match(page, /Active trials/);
  assert.match(page, /Customers/);
});

test("P3.1 records immutable lifecycle history and Control Plane audit evidence", () => {
  assert.match(migration, /insert into public\.property_commercial_lifecycle_events/i);
  assert.match(migration, /insert into public\.control_plane_audit_log/i);
  assert.match(migration, /'schemaVersion','p3\.1'/);
  assert.match(migration, /'requestHash',p_request_hash/);
});
