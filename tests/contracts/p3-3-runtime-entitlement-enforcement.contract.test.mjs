import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260817205000_p3_3_runtime_entitlement_enforcement.sql",
  import.meta.url,
);
const helperPath = new URL("../../lib/server/commercial-runtime-entitlement.ts", import.meta.url);
const hotelScopePath = new URL("../../lib/server/hotel-scope.ts", import.meta.url);
const guestAccessPath = new URL("../../lib/server/guest-stay-access.ts", import.meta.url);
const staffSessionPath = new URL("../../lib/staff-auth/session.ts", import.meta.url);
const hotelPagePath = new URL("../../app/h/[hotelSlug]/page.tsx", import.meta.url);
const packagePath = new URL("../../package.json", import.meta.url);

const [migration, helper, hotelScope, guestAccess, staffSession, hotelPage, packageRaw] =
  await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(helperPath, "utf8"),
    readFile(hotelScopePath, "utf8"),
    readFile(guestAccessPath, "utf8"),
    readFile(staffSessionPath, "utf8"),
    readFile(hotelPagePath, "utf8"),
    readFile(packagePath, "utf8"),
  ]);
const pkg = JSON.parse(packageRaw);

test("P3.3 runtime entitlement RPC is read-only, stable and service-role only", () => {
  assert.match(migration, /create or replace function public\.resolve_hotel_commercial_runtime_entitlement_v1/);
  assert.match(migration, /language plpgsql\s+stable\s+security definer\s+set search_path = ''/s);
  assert.match(migration, /revoke all on function public\.resolve_hotel_commercial_runtime_entitlement_v1\(uuid\) from public/);
  assert.match(migration, /from anon/);
  assert.match(migration, /from authenticated/);
  assert.match(migration, /grant execute on function public\.resolve_hotel_commercial_runtime_entitlement_v1\(uuid\) to service_role/);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\b/i);
});

test("P3.3 preserves legacy unmanaged Production and non-Production access", () => {
  assert.match(migration, /'effectiveStatus', 'legacy_unmanaged'/);
  assert.match(migration, /'accessAllowed', true/);
  assert.match(migration, /v_environment\.environment <> 'production'/);
  assert.match(migration, /'effectiveStatus', 'non_production_bypass'/);
});

test("P3.3 allows only active trial or active customer for managed Production", () => {
  assert.match(migration, /v_commercial\.status = 'active_customer'/);
  assert.match(migration, /v_effective_status := 'customer_active'/);
  assert.match(migration, /v_commercial\.status = 'trial'/);
  assert.match(migration, /v_commercial\.trial_ends_at > statement_timestamp\(\)/);
  assert.match(migration, /v_effective_status := 'trial_active'/);
  assert.match(migration, /v_effective_status := 'trial_expired'/);
});

test("P3.3 fail-closes pending, suspended, ended and malformed managed commercial state", () => {
  for (const state of ["pending", "suspended", "ended", "commercial_invalid"]) {
    assert.match(migration, new RegExp(`v_effective_status := '${state}'`));
  }
  assert.match(migration, /v_access_allowed := false/);
});

test("P3.3 server helper validates exact hotel scope and exposes one typed denial", () => {
  assert.match(helper, /resolve_hotel_commercial_runtime_entitlement_v1/);
  assert.match(helper, /hotelId !== expectedHotelId/);
  assert.match(helper, /COMMERCIAL_RUNTIME_ENTITLEMENT_SCOPE_MISMATCH/);
  assert.match(helper, /class CommercialRuntimeAccessDeniedError/);
  assert.match(helper, /COMMERCIAL_RUNTIME_ACCESS_BLOCKED/);
});

test("P3.3 hotel runtime resolver enforces commercial access after active hotel resolution", () => {
  const activeGate = hotelScope.indexOf('.eq("active", true)');
  const entitlementGate = hotelScope.indexOf("requireHotelCommercialRuntimeAccess(data.id)");
  assert.ok(activeGate >= 0);
  assert.ok(entitlementGate > activeGate);
});

test("P3.3 existing guest stay reads and writes are blocked through the shared access layer", () => {
  assert.match(guestAccess, /await requireCommercialGuestRuntimeAccess\(hotelId\)/);
  assert.match(guestAccess, /COMMERCIAL_ACCESS_BLOCKED/);
  assert.match(guestAccess, /requireGuestStayWriteAccess/);
  assert.match(guestAccess, /requireGuestStayReadAccess/);
});

test("P3.3 existing staff sessions stop authorizing while commercial access is blocked", () => {
  assert.match(staffSession, /await requireHotelCommercialRuntimeAccess\(data\.hotel_id\)/);
  assert.match(staffSession, /isCommercialRuntimeAccessDeniedError\(commercialError\)/);
  const commercialBlockStart = staffSession.indexOf("try {\n    await requireHotelCommercialRuntimeAccess");
  const commercialBlockEnd = staffSession.indexOf("\n\n  return data;", commercialBlockStart);
  assert.ok(commercialBlockStart >= 0 && commercialBlockEnd > commercialBlockStart);
  const commercialBlock = staffSession.slice(commercialBlockStart, commercialBlockEnd);
  assert.match(commercialBlock, /return null/);
  assert.doesNotMatch(commercialBlock, /revoked_at|\.update\(/);
});

test("P3.3 Guest Hub entry renders a safe unavailable state instead of loading tenant config", () => {
  const entitlementGate = hotelPage.indexOf("await resolveHotelByAnySlugAdmin(hotelSlug)");
  const configLoad = hotelPage.indexOf("await getHotelConfig(hotelSlug)");
  assert.ok(entitlementGate >= 0);
  assert.ok(configLoad > entitlementGate);
  assert.match(hotelPage, /isCommercialRuntimeAccessDeniedError\(error\)/);
  assert.match(hotelPage, /Digital concierge unavailable/);
  assert.match(hotelPage, /Please contact Reception/);
});

test("P3.3 does not add cron-driven commercial expiry or mutate technical tenant lifecycle", () => {
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|hotels\s+set|properties\s+set/i);
  assert.doesNotMatch(helper, /\.from\("property_commercial_state"\)\.(insert|update|delete)/);
  assert.doesNotMatch(helper, /\.from\("hotels"\)\.(insert|update|delete)/);
});

test("P3.3 commercial entitlement is runtime authorization, not Control Plane authority", () => {
  assert.doesNotMatch(helper, /platform_admin|control-plane/i);
  assert.doesNotMatch(migration, /control_plane_audit_log/i);
});

test("P3.3 is wired into the full contract suite", () => {
  assert.match(pkg.scripts["test:contracts"], /p3-3-runtime-entitlement-enforcement\.contract\.test\.mjs/);
  assert.equal(
    pkg.scripts["test:p3-3"],
    "node --test tests/contracts/p3-3-runtime-entitlement-enforcement.contract.test.mjs",
  );
});
