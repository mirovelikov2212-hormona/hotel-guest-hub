import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildHotelSlugOrFilter,
  getHotelSlugCandidates,
  sanitizeHotelSlug,
} from "../../lib/hotels/hotel-slug.mjs";
import { validateHotelOnboardingFixture } from "../helpers/hotel-onboarding-contract.mjs";
import { assertContains, readProjectFile } from "../helpers/source-contract.mjs";

const validFixtureUrl = new URL(
  "../fixtures/hotels/generic-valid-hotel.json",
  import.meta.url,
);

async function readValidFixture() {
  return JSON.parse(await readFile(fileURLToPath(validFixtureUrl), "utf8"));
}

test("generic hotel slugs remain generic and require no hotel-specific branch", () => {
  assert.equal(sanitizeHotelSlug("  Seaside-Demo_Hotel  "), "seaside-demo_hotel");
  assert.deepEqual(getHotelSlugCandidates("seaside-demo-hotel"), [
    "seaside-demo-hotel",
  ]);
  assert.equal(
    buildHotelSlugOrFilter(["seaside-demo-hotel"]),
    "slug.eq.seaside-demo-hotel,public_slug.eq.seaside-demo-hotel",
  );
});

test("legacy Aquamarine aliases stay backward compatible without crossing sandbox boundaries", () => {
  assert.deepEqual(getHotelSlugCandidates("aquamarine"), [
    "aquamarine",
    "aquamarin",
  ]);
  assert.deepEqual(getHotelSlugCandidates("aquamarin"), [
    "aquamarin",
    "aquamarine",
  ]);
  assert.deepEqual(getHotelSlugCandidates("aquamarine-test"), [
    "aquamarine-test",
    "aquamarin-test",
  ]);
  assert.equal(
    getHotelSlugCandidates("aquamarine").includes("aquamarin-test"),
    false,
  );
});

test("hotel scope and sheet source resolution share one slug candidate contract", async () => {
  const scopeSource = await readProjectFile("lib/server/hotel-scope.ts");
  const sheetSource = await readProjectFile(
    "lib/hotels/getHotelSheetSources.ts",
  );

  for (const source of [scopeSource, sheetSource]) {
    assertContains(source, 'from "@/lib/hotels/hotel-slug.mjs"');
    assertContains(source, "getHotelSlugCandidates");
    assertContains(source, "buildHotelSlugOrFilter");
  }
});

test("a generic multi-hotel onboarding fixture satisfies the M2 contract", async () => {
  const fixture = await readValidFixture();
  assert.deepEqual(validateHotelOnboardingFixture(fixture), {
    ok: true,
    errors: [],
    warnings: [],
  });
});

test("malformed onboarding data fails with actionable contract errors", async () => {
  const fixture = await readValidFixture();
  fixture.languages = ["en", "en", "fr"];
  fixture.languageDefault = "bg";
  fixture.opsLanguage = "bg";
  fixture.hotelTimezone = "Invalid/Timezone";
  fixture.urls.roomsCsvUrl = "http://example.com/rooms.csv";
  fixture.rooms = [
    { roomNumber: "101", active: true },
    { roomNumber: "101", active: true },
  ];
  fixture.requestDefs = [
    {
      id: "paid_service",
      targetDepartment: "unknown-department",
      requiresBilling: true,
    },
    {
      id: "paid_service",
      targetDepartment: "reception",
      requiresBilling: false,
    },
  ];

  const result = validateHotelOnboardingFixture(fixture);
  assert.equal(result.ok, false);
  for (const expected of [
    "LANGUAGES_DUPLICATED",
    "LANGUAGE_UNSUPPORTED:fr",
    "DEFAULT_LANGUAGE_NOT_ENABLED",
    "OPS_LANGUAGE_NOT_ENABLED",
    "HOTEL_TIMEZONE_INVALID",
    "URL_INVALID:roomsCsvUrl",
    "ROOM_NUMBER_DUPLICATED",
    "REQUEST_ID_DUPLICATED",
    "REQUEST_DEPARTMENT_INVALID:paid_service",
    "REQUEST_PRICE_REQUIRED:paid_service",
    "REQUEST_CURRENCY_REQUIRED:paid_service",
  ]) {
    assert.ok(result.errors.includes(expected), `Missing validation error: ${expected}`);
  }
});

test("runtime config keeps Supabase hotel identity and required sheet contracts", async () => {
  const source = await readProjectFile("lib/config.ts");

  for (const fragment of [
    "hotelId: sheetSources.hotelId",
    "hotelSlug: sheetSources.hotelSlug",
    "isSandbox: Boolean(sheetSources.isSandbox)",
    "productionHotelId: sheetSources.productionHotelId ?? null",
    "if (!configUrl)",
    "if (!i18nUrl)",
    "hotelTimezone:",
    "validRoomNumbers",
    "requestDefs",
  ]) {
    assertContains(source, fragment);
  }
});
