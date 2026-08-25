import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260825190000_p2_5_sandbox_staff_credentials.sql",
  "utf8",
);
const route = fs.readFileSync(
  "app/api/control-plane/sandbox-credentials/route.ts",
  "utf8",
);

test("P2.5 Sandbox staff credential provisioning is certified, sandbox-only and fail-closed", () => {
  assert.match(migration, /provision_factory_sandbox_staff_credentials_v1/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /P2_5_SANDBOX_CREDENTIAL_ADMIN_FORBIDDEN/);
  assert.match(migration, /v_actor_role not in \('super_admin', 'operator'\)/);
  assert.match(migration, /v_sandbox\.is_sandbox is distinct from true/);
  assert.match(migration, /v_sandbox\.active is distinct from true/);
  assert.match(migration, /P2_5_SANDBOX_CREDENTIAL_PRODUCTION_NOT_DARK/);
  assert.match(migration, /hs\.certification_status = 'passed'/);
  assert.match(migration, /hs\.certified_revision_id = p_expected_certified_revision_id/);
  assert.match(migration, /pi\.status = 'certified'/);
  assert.match(migration, /provisionSandboxCredentials', true/);
  assert.match(migration, /provisionProductionCredentials', false/);
  assert.match(migration, /rotateExisting', true/);
  assert.match(migration, /P2_5_SANDBOX_CREDENTIAL_ROLE_SET_MISMATCH/);
  assert.match(migration, /scrypt\\\$16384\\\$8\\\$1/);
  assert.match(migration, /on conflict \(hotel_id, role\) do update/i);
  assert.match(migration, /update public\.staff_sessions ss[\s\S]*ss\.revoked_at is null/);
  assert.match(migration, /factory_sandbox_staff_credentials_provisioned/);
  assert.match(migration, /productionCredentialsProvisioned', false/);
  assert.match(migration, /revoke all on function public\.provision_factory_sandbox_staff_credentials_v1/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role, postgres/);
  assert.doesNotMatch(migration, /to anon|to authenticated/);
});

test("Control Plane generates one-time Sandbox PINs server-side and sends only hashes to the RPC", () => {
  assert.match(route, /enforceControlPlaneSameOrigin/);
  assert.match(route, /getCurrentPlatformAdminSession/);
  assert.match(route, /provisionSandboxCredentials: true/);
  assert.match(route, /provisionProductionCredentials: false/);
  assert.match(route, /rotateExisting: true/);
  assert.match(route, /crypto\.randomInt\(100_000, 1_000_000\)/);
  assert.match(route, /hashPin\(pins\[role\]\)/);
  assert.match(route, /provision_factory_sandbox_staff_credentials_v1/);
  assert.match(route, /p_expected_certified_revision_id: expectedCertifiedRevisionId/);
  assert.match(route, /credentials: roles\.map\(\(role\) => \(\{ role, pin: pins\[role\] \}\)\)/);
  assert.match(route, /productionCredentialsProvisioned: false/);
  assert.doesNotMatch(route, /from\("staff_access_pins"\)/);
  assert.doesNotMatch(route, /console\.(log|info|warn)\([^\n]*pins/i);
});
