import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260907043000_centralize_massage_catalog_authority.sql", import.meta.url),
  "utf8",
);
const admin = readFileSync(
  new URL("../../lib/server/massage-catalog-admin.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../app/api/control-plane/massage-catalog/route.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/control-panel/massages/page.tsx", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../../components/control-panel/MassageCatalogEditor.tsx", import.meta.url),
  "utf8",
);

const externalStart = migration.indexOf(
  "create or replace function public.project_massage_snapshot_to_runtime_external_only",
);
const adminStart = migration.indexOf(
  "create or replace function public.upsert_massage_catalog_service_v1",
);
const externalProjection = migration.slice(externalStart, adminStart);

test("external massage projection no longer mutates or delegates catalogue authority", () => {
  assert.ok(externalStart >= 0 && adminStart > externalStart);
  assert.doesNotMatch(externalProjection, /project_massage_snapshot_to_runtime\s*\(/);
  assert.doesNotMatch(externalProjection, /update public\.massage_runtime_services/);
  assert.doesNotMatch(externalProjection, /insert into public\.massage_runtime_services/);
  assert.match(externalProjection, /snapshotCatalogIgnored', true/);
  assert.match(externalProjection, /catalogAuthority', 'stayhub'/);
});

test("external availability only uses pre-existing active central services", () => {
  assert.match(externalProjection, /join public\.massage_runtime_services rs/);
  assert.match(externalProjection, /rs\.service_id = svc\.service_id/);
  assert.match(externalProjection, /rs\.active = true/);
  assert.match(externalProjection, /rs\.service_id,[\s\S]*legacy_snapshot/);
  assert.match(externalProjection, /left join public\.massage_runtime_services rs[\s\S]*rs\.service_id = booking->>'serviceId'/);
  assert.match(externalProjection, /catalogMatched', \(rs\.service_id is not null\)/);
});

test("external blocker projection preserves exact native mirror fail-safe", () => {
  assert.match(externalProjection, /rb\.is_stayhub_marker = true/);
  assert.match(externalProjection, /from public\.massage_runtime_bookings nb/);
  assert.match(externalProjection, /nb\.hotel_id = rb\.hotel_id/);
  assert.match(externalProjection, /nb\.status = 'confirmed'/);
  assert.match(externalProjection, /nb\.is_test = false/);
  assert.match(externalProjection, /nb\.booking_date = rb\.booking_date/);
  assert.match(externalProjection, /nb\.start_time = rb\.start_time/);
  assert.match(externalProjection, /nb\.service_id = rb\.service_id/);
  assert.match(externalProjection, /proven_native_sheet_mirror/);
});

test("legacy projected catalogue is adopted as native StayHub authority", () => {
  assert.match(migration, /update public\.massage_runtime_services/);
  assert.match(migration, /set source_kind = 'native'/);
  assert.match(migration, /source_snapshot_id = null/);
  assert.match(migration, /where source_kind = 'legacy_snapshot'/);
  assert.match(migration, /authorityVersion', 'central-catalog-v1'/);
});

test("central catalogue mutation RPC is platform-admin gated and service-role only", () => {
  assert.match(migration, /upsert_massage_catalog_service_v1/);
  assert.match(migration, /from public\.platform_admins/);
  assert.match(migration, /v_actor_role not in \('super_admin', 'operator'\)/);
  assert.match(migration, /MASSAGE_CATALOG_ADMIN_FORBIDDEN/);
  assert.match(migration, /source_kind,[\s\S]*'native'/);
  assert.match(migration, /source_snapshot_id = null/);
  assert.match(migration, /revoke all on function public\.upsert_massage_catalog_service_v1/);
  assert.match(migration, /to service_role, postgres/);
});

test("central catalogue admin records edits and API enforces Control Plane session/origin", () => {
  assert.match(admin, /canMutateControlPlane/);
  assert.match(admin, /upsert_massage_catalog_service_v1/);
  assert.match(admin, /massage_catalog_service_updated/);
  assert.match(admin, /before: result\.before/);
  assert.match(admin, /after: result\.after/);
  assert.match(route, /enforceControlPlaneSameOrigin/);
  assert.match(route, /getCurrentPlatformAdminSession/);
  assert.match(route, /payload_too_large/);
});

test("Control Panel exposes a multi-hotel central massage catalogue editor", () => {
  assert.match(page, /listMassageCatalogHotels/);
  assert.match(page, /listMassageCatalogServices/);
  assert.match(page, /Catalog authority: StayHub/);
  assert.match(editor, /Price/);
  assert.match(editor, /Currency/);
  assert.match(editor, /Duration \(min\)/);
  assert.match(editor, /Buffer \(min\)/);
  assert.match(editor, /Sort order/);
  assert.match(editor, /Add locale/);
  assert.match(editor, /Create service/);
});
