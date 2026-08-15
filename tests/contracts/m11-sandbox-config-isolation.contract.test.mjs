import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const MIGRATION =
  "supabase/migrations/20260814190000_m11_1_sandbox_config_clone.sql";

test("M11 sandbox configuration is cloned from an exact published Production revision", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "clone_production_config_to_sandbox_draft");
  assertContains(migration, "production_clone");
  assertContains(migration, "h.is_sandbox = true");
  assertContains(migration, "v_sandbox.production_hotel_id");
  assertContains(migration, "p_expected_production_revision_id");
  assertContains(migration, "M11_PRODUCTION_REVISION_CHANGED");
  assertContains(migration, "v_production_revision.status <> 'published'");
  assertContains(migration, "M11_PRODUCTION_REVISION_NOT_VALIDATED");
  assertContains(migration, "'productionRevisionId'");
  assertContains(migration, "'productionSourceChecksum'");

  assertNotContains(migration, "843ec551-786a-46c4-989b-9da98956cd19");
  assertNotContains(migration, "05624aa0-ffcb-4f93-8cb8-a0bdc85e1962");
  assertNotContains(migration, "aquamarin-test");
  assertNotContains(migration, "aquamarin");
});

test("M11 clone RPC is service-side only and cannot be executed by guest roles", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "security invoker");
  assertContains(migration, "set search_path = ''");
  assertContains(
    migration,
    "revoke all on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) from public",
  );
  assertContains(
    migration,
    "revoke all on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) from anon",
  );
  assertContains(
    migration,
    "revoke all on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) from authenticated",
  );
  assertContains(
    migration,
    "grant execute on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) to service_role",
  );
});

test("sandbox sheet snapshot import fails before any shared editorial source is read", async () => {
  const source = await readProjectFile("lib/server/config-snapshot-import.ts");
  const sourceLookup = source.indexOf("await getHotelSheetSources(hotelSlug)");
  const sandboxGuard = source.indexOf("if (sources.isSandbox)");
  const sheetRead = source.indexOf("await getHotelConfigFromSheets(hotelSlug)");

  assert.ok(sourceLookup >= 0, "hotel source metadata must be resolved first");
  assert.ok(sandboxGuard > sourceLookup, "sandbox guard must run after tenant resolution");
  assert.ok(sheetRead > sandboxGuard, "mutable Sheet read must occur only after sandbox is rejected");
  assertContains(source, "SANDBOX_SHEET_IMPORT_FORBIDDEN");
});

test("server-side clone helper validates sandbox ownership and exact Production linkage", async () => {
  const source = await readProjectFile("lib/server/sandbox-config.ts");

  assertContains(source, "resolveHotelByAnySlugAdmin");
  assertContains(source, "isSandboxHotel(sandboxHotel)");
  assertContains(source, "sandboxHotel.production_hotel_id");
  assertContains(source, '"clone_production_config_to_sandbox_draft"');
  assertContains(source, "p_sandbox_hotel_id: sandboxHotel.id");
  assertContains(source, "p_expected_production_revision_id: expectedProductionRevisionId");
  assertContains(source, "result.sandbox_hotel_id !== sandboxHotel.id");
  assertContains(source, "result.production_hotel_id !== sandboxHotel.production_hotel_id");
});

test("M11 manual sandbox edits are based on an exact sandbox-owned immutable revision", async () => {
  const source = await readProjectFile("lib/server/sandbox-config.ts");

  assertContains(source, "export async function createSandboxManualConfigDraft");
  assertContains(source, "RUNTIME_IDENTITY_KEYS");
  assertContains(source, "M11_SANDBOX_RUNTIME_IDENTITY_IMMUTABLE");
  assertContains(source, '.from("hotel_config_revisions")');
  assertContains(source, '.eq("hotel_id", sandboxHotel.id)');
  assertContains(source, '.eq("id", baseRevisionId)');
  assertContains(source, '.in("status", ["draft", "published"])');
  assertContains(source, "validateSandboxDraftConfig(config)");
  assertContains(source, 'source: "sandbox_manual"');
  assertContains(source, 'editKind: "sandbox_manual_patch"');
  assertContains(source, '"create_hotel_config_draft"');
  assertContains(source, 'p_source_type: "manual"');
  assertContains(source, "p_hotel_id: sandboxHotel.id");
  assertContains(source, "result.hotel_id !== sandboxHotel.id");

  for (const key of [
    '"hotelId"',
    '"hotelSlug"',
    '"publicSlug"',
    '"isSandbox"',
    '"productionHotelId"',
    '"testRoomNumbers"',
  ]) {
    assertContains(source, key);
  }
});

test("M11 sandbox side effects are fail-safe for reports, push reminders and massage Sheet writes", async () => {
  const reportCron = await readProjectFile("app/api/cron/report-email/route.ts");
  const weeklyReportCron = await readProjectFile("app/api/cron/weekly-report/route.ts");
  const reminderCron = await readProjectFile("app/api/cron/massage-reminders/route.ts");
  const hotelScope = await readProjectFile("lib/server/hotel-scope.ts");
  const massageRoute = await readProjectFile("app/api/guest/massages/route.ts");

  assertContains(reportCron, '.eq("is_sandbox", false)');
  assertContains(weeklyReportCron, '.eq("is_sandbox", false)');
  assertContains(hotelScope, "return isSandboxHotel(input.hotel) || Boolean(input.testRoomPolicy?.isTest)");
  assertContains(reminderCron, '.eq("is_test", false)');
assertContains(reminderCron, '.eq("status", "confirmed")');
assertContains(reminderCron, '.is("cancelled_at", null)');
assertContains(reminderCron, "hotel.is_sandbox");
  assertContains(massageRoute, "const runtimeAuthority = await getMassageRuntimeAuthority(hotel.id)");
  assertContains(massageRoute, "isNativeMassageAuthority(runtimeAuthority)");
  assertContains(massageRoute, 'authority: "native_supabase"');
  assertContains(massageRoute, "sheetWrite: false");
  assertContains(massageRoute, "createSandboxNativeMassageBooking");

  assertNotContains(massageRoute, "isMassageSandboxLiveWriteEnabled");
  assertNotContains(massageRoute, "isApprovedMassageSandboxLiveWriteCandidate");
  assertNotContains(massageRoute, 'action: "sandbox_live_write"');
  assertNotContains(massageRoute, "MASSAGE_SANDBOX_LIVE_WRITE_CANDIDATE_NOT_ALLOWED");
});
