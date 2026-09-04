import assert from "node:assert/strict";
import test from "node:test";

import { assertContains, readProjectFile } from "../helpers/source-contract.mjs";

test("Factory guest writes reuse consolidated scope and identity RPCs with explicit legacy fallback", async () => {
  const context = await readProjectFile("lib/server/factory-guest-context.ts");
  const hotelScope = await readProjectFile("lib/server/hotel-scope.ts");
  const directory = await readProjectFile("lib/hotels/getHotelSheetSources.ts");
  const stays = await readProjectFile("lib/server/guest-stays.ts");

  assertContains(context, 'supabaseAdmin.rpc("get_factory_guest_scope_v1"');
  assertContains(context, '"get_factory_guest_write_context_v1"');
  assertContains(context, 'data.status === "fallback_required"');
  assertContains(context, 'data.status === "stay_ended"');
  assertContains(context, "FACTORY_GUEST_WRITE_CONTEXT_IDENTITY_MISMATCH");
  assertContains(hotelScope, "resolveFactoryGuestScopeFastPath(inputSlug)");
  assertContains(directory, "getPrimedFactoryRuntimeBySlug");
  assertContains(directory, "primeSharedRuntimeCaches(primedRuntime)");
  assertContains(stays, "resolveFactoryGuestWriteIdentity(input)");
  assertContains(stays, "validateGuestStayIdentityLegacy(input)");
});

test("Factory guest write RPC assigns table columns into rowtype records", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260904114500_factory_guest_write_context_rowtype_fix.sql",
  );

  assertContains(migration, "select s.*\n    into v_stay");
  assertContains(migration, "select d.*\n    into v_device");
  assert.ok(
    !migration.includes("select s\n    into v_stay"),
    "guest_stays rowtype must not receive a single composite-record value",
  );
  assert.ok(
    !migration.includes("select d\n    into v_device"),
    "guest_stay_devices rowtype must not receive a single composite-record value",
  );
});

test("Factory test-room cache skips only authoritative negative lookups", async () => {
  const testRooms = await readProjectFile("lib/server/test-rooms.ts");

  assertContains(testRooms, "getPrimedFactoryRuntimeByHotelId");
  assertContains(testRooms, "!factoryRuntime.testRoomNumbers.includes(normalizedRoom)");
  assertContains(testRooms, "custom expiry seconds are not");
  assertContains(testRooms, 'from("hotel_test_rooms")');
});

test("native massage staff projection is deferred without moving the authoritative booking", async () => {
  const reconciliation = await readProjectFile(
    "lib/server/massage-native-reconciliation.ts",
  );
  const route = await readProjectFile("app/api/guest/massages/route.ts");

  assertContains(reconciliation, 'import { waitUntil } from "@vercel/functions"');
  assertContains(reconciliation, "attachNativeMassageStaffRequestNow");
  assertContains(reconciliation, 'action: "pending" as const');
  assertContains(route, 'timing.mark("authoritative_booking")');
  assertContains(route, 'timing.mark("staff_projection")');
  assert.ok(
    route.indexOf('timing.mark("authoritative_booking")') <
      route.indexOf('timing.mark("staff_projection")'),
    "Authoritative massage booking must remain before deferred staff projection.",
  );
});
