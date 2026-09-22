import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5.2 manager content-change API is hotel-scoped and never grants PlatformAdminAuthority", async () => {
  const server = await readProjectFile("lib/server/manager-content-changes.ts");
  const route = await readProjectFile("app/api/staff/content-changes/route.ts");

  for (const fragment of [
    'getCurrentStaffSession(hotelSlug, "manager")',
    '.eq("id", session.hotel_id)',
    "hotelMatchesRequestedSlug",
    'resolveStaffRuntimeRoleForHotelId(String(hotel.id), "manager")',
    '.eq("hotel_id", scope.hotelId)',
    "enforceStaffSameOrigin(req)",
  ]) {
    assertContains(server + route, fragment);
  }

  assertNotContains(server + route, "PlatformAdminAuthority");
  assertNotContains(server + route, "canMutateControlPlane");
  assertNotContains(server + route, "service_role");
});

test("CM5.2 creates and confirms changes through DB CAS functions instead of browser-supplied LIVE identity", async () => {
  const server = await readProjectFile("lib/server/manager-content-changes.ts");

  for (const fragment of [
    '"create_hotel_content_change_request_v1"',
    '"confirm_hotel_content_change_request_v1"',
    '"cancel_hotel_content_change_request_v1"',
    "p_hotel_id: scope.hotelId",
    "p_actor_session_id: scope.sessionId",
  ]) {
    assertContains(server, fragment);
  }

  assertNotContains(server, "baseLiveRevisionId: input.");
  assertNotContains(server, "baseLiveChecksum: input.");
});

test("CM5.2 scope is explicit and generic for 100+ hotels", async () => {
  const source = await readProjectFile("lib/server/manager-content-changes.ts");

  for (const fragment of ['"offers"', '"services"', '"venues"']) {
    assertContains(source, fragment);
  }

  for (const forbidden of [
    "aquamarine",
    "aquamarin",
    "kranevo",
    "kirman",
    "wagrainerhof",
    "08:00",
    "17:00",
  ]) {
    assertNotContains(source.toLowerCase(), forbidden.toLowerCase());
  }
});

test("CM5.2 does not expose arbitrary config JSON patching", async () => {
  const route = await readProjectFile("app/api/staff/content-changes/route.ts");
  const server = await readProjectFile("lib/server/manager-content-changes.ts");

  assertNotContains(route, "operations_json");
  assertNotContains(route, "config_json");
  assertNotContains(route, "jsonPatch");
  assertNotContains(server, ".update({ config_json");
});
