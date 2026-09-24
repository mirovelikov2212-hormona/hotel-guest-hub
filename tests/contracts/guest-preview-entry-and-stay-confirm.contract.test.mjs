import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveGuestRootEntry } from "../../lib/server/guest-root-entry.mjs";

test("Vercel Preview root is isolated in the configured sandbox guest hub", () => {
  assert.equal(
    resolveGuestRootEntry({
      host: "hotel-guest-abc-miroslav-velikovs-projects.vercel.app",
      vercelEnv: "preview",
      previewHotelSlug: "aquamarine-test",
    }),
    "/h/aquamarine-test",
  );
});

test("Production StayHub routing keeps hotel subdomains authoritative", () => {
  assert.equal(
    resolveGuestRootEntry({ host: "aquamarine.stayhub.app", vercelEnv: "production" }),
    "/h/aquamarine",
  );
  assert.equal(
    resolveGuestRootEntry({ host: "stayhub.app", vercelEnv: "production" }),
    "/h/demo",
  );
});

test("GOSTAYA public domain resolves to the marketing site, not a hotel tenant", () => {
  assert.equal(
    resolveGuestRootEntry({ host: "gostaya.com", vercelEnv: "production" }),
    "/en",
  );
  assert.equal(
    resolveGuestRootEntry({ host: "www.gostaya.com", vercelEnv: "production" }),
    "/en",
  );
});

test("public marketing demo is isolated to the demo gate and advertises the dedicated PIN", async () => {
  const accessSource = await readFile(new URL("../../lib/demo-access.ts", import.meta.url), "utf8");
  const hotelPageSource = await readFile(new URL("../../app/h/[hotelSlug]/page.tsx", import.meta.url), "utf8");
  const accessRouteSource = await readFile(new URL("../../app/api/demo-access/route.ts", import.meta.url), "utf8");

  assert.match(accessSource, /PUBLIC_MARKETING_DEMO_PIN = "2026"/);
  assert.match(accessSource, /safeEqual\(submittedPin, PUBLIC_MARKETING_DEMO_PIN\)/);
  assert.match(accessSource, /configuredPin \|\| PUBLIC_MARKETING_DEMO_PIN/);
  assert.match(hotelPageSource, /hotelSlug\.trim\(\)\.toLowerCase\(\) === "demo"/);
  assert.match(hotelPageSource, /PUBLIC_MARKETING_DEMO_PIN/);
  assert.match(hotelPageSource, /Demo среда/);
  assert.match(accessRouteSource, /validateDemoAccessPin/);
  assert.match(accessRouteSource, /nextPath/);
  assert.match(accessRouteSource, /"\/h\/demo"/);
});

test("public demo room 901 is configured as an isolated test room with guided tour", async () => {
  const demoConfig = JSON.parse(
    await readFile(new URL("../../data/hotels/demo.json", import.meta.url), "utf8"),
  );
  const guestHubSource = await readFile(
    new URL("../../components/GuestHub.tsx", import.meta.url),
    "utf8",
  );
  const guideSource = await readFile(
    new URL("../../components/guest/DemoJourneyGuide.tsx", import.meta.url),
    "utf8",
  );

  assert.deepEqual(demoConfig.validRoomNumbers, ["901"]);
  assert.deepEqual(demoConfig.testRoomNumbers, ["901"]);
  assert.equal(demoConfig.testModeEnabled, true);
  assert.equal(demoConfig.geoGuardEnabled, false);
  assert.ok(demoConfig.hotelRooms.some((room) => room.roomNumber === "901" && room.active === true));

  assert.match(guestHubSource, /isPublicDemoHotel/);
  assert.match(guestHubSource, /setManualRoomInput\(storedRoom \|\| \(isPublicDemoHotel \? "901" : ""\)\)/);
  assert.match(guestHubSource, /<DemoJourneyGuide/);
  assert.match(guideSource, /Step 1/);
  assert.match(guideSource, /901/);
  assert.match(guideSource, /\/staff\/demo\/housekeeping/);
  assert.match(guideSource, /\/staff\/demo\/manager/);
});

test("invalid preview slug cannot escape the hotel route", () => {
  assert.equal(
    resolveGuestRootEntry({
      host: "example.vercel.app",
      vercelEnv: "preview",
      previewHotelSlug: "../../admin",
    }),
    "/h/aquamarine-test",
  );
});

test("root page preserves query parameters and delegates routing to the shared resolver", async () => {
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /resolveGuestRootEntry/);
  assert.match(source, /process\.env\.VERCEL_ENV/);
  assert.match(source, /process\.env\.STAYHUB_PREVIEW_HOTEL_SLUG/);
  assert.match(source, /Object\.entries\(sp \|\| \{\}\)/);
  assert.doesNotMatch(source, /redirect\("\/h\/demo"\)/);
});

test("validated hotel route remains the guest operational tenant authority", async () => {
  const source = await readFile(new URL("../../app/h/[hotelSlug]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /await resolveHotelByAnySlugAdmin\(hotelSlug\)/);
  assert.match(source, /const guestRuntimeHotelSlug = hotelSlug\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /const guestConfig = \{\s*\.\.\.cfg,\s*hotelSlug: guestRuntimeHotelSlug,\s*\}/s);
  assert.match(source, /<GuestHub config=\{guestConfig\} \/>/);
  assert.doesNotMatch(source, /<GuestHub config=\{cfg\} \/>/);
});

test("stay confirmation translates relational inactive-room enforcement into guest validation", async () => {
  const source = await readFile(new URL("../../app/api/guest/stay/confirm/route.ts", import.meta.url), "utf8");
  assert.match(source, /GUEST_STAY_ROOM_NOT_ACTIVE/);
  assert.match(source, /INVALID_ROOM/);
});
