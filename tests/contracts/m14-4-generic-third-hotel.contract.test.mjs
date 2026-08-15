import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildHotelSlugOrFilter,
  getHotelSlugCandidates,
} from "../../lib/hotels/hotel-slug.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";
import { validateHotelOnboardingFixture } from "../helpers/hotel-onboarding-contract.mjs";

const fixtureUrl = new URL("../fixtures/hotels/generic-valid-hotel.json", import.meta.url);

async function readFixture() {
  return JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8"));
}

test("M14.4 resolves internal/public slugs from tenant data without hotel-specific alias branches", () => {
  assert.deepEqual(getHotelSlugCandidates("aquamarine"), ["aquamarine"]);
  assert.deepEqual(getHotelSlugCandidates("aquamarin"), ["aquamarin"]);
  assert.deepEqual(getHotelSlugCandidates("third-hotel-public"), ["third-hotel-public"]);
  assert.equal(
    buildHotelSlugOrFilter(["third-hotel-public"]),
    "slug.eq.third-hotel-public,public_slug.eq.third-hotel-public",
  );
});

test("M14.4 public alias and QR routing are generic and do not require a custom subdomain", async () => {
  const aliasSource = await readProjectFile("lib/server/hotel-public-alias.ts");
  const qrSource = await readProjectFile("app/qr/[hotelAlias]/route.ts");

  assertNotContains(aliasSource, "aquamarin");
  assertContains(aliasSource, "input.public_slug");
  assertContains(qrSource, "https://www.stayhub.app");
  assertContains(qrSource, "`/h/${publicAlias}`");
  assertNotContains(qrSource, "`https://${publicAlias}.stayhub.app`");
});

test("M14.4 operational runtime does not inherit Aquamarine timezone defaults", async () => {
  const paths = [
    "lib/staff/operations-hours-model.mjs",
    "lib/server/guest-stays.ts",
    "lib/server/day3-surveys.ts",
    "app/api/guest/push/subscription/route.ts",
    "app/api/cron/day3-survey-push/route.ts",
    "app/api/cron/massage-snapshot-sync/route.ts",
    "app/api/cron/massage-sheet-sync/route.ts",
    "app/api/cron/massage-reminders/route.ts",
  ];

  for (const path of paths) {
    const source = await readProjectFile(path);
    assertNotContains(source, "Europe/Sofia", `${path} must not contain an Aquamarine timezone fallback`);
  }

  const staffRequests = await readProjectFile("app/api/staff/requests/route.ts");
  assertContains(staffRequests, "await getHotelConfig(scope.hotelSlug)");
  assertNotContains(staffRequests, 'scope.environment === "sandbox"\n        ? await getHotelConfig');
});

test("M14.4 external massage adapters are explicit tenant config and fail closed", async () => {
  const massageApi = await readProjectFile("lib/server/massage-api.ts");
  const adapterConfig = await readProjectFile("lib/server/massage-external-source.ts");
  const snapshotCron = await readProjectFile("app/api/cron/massage-snapshot-sync/route.ts");
  const workflow = await readProjectFile(".github/workflows/massage-sheet-sync.yml");

  for (const fragment of [
    "HOTEL_SLUG_ALIASES",
    "MASSAGE_CONFIG_SLUG_ALIASES",
    "DEFAULT_MASSAGE_HOTEL_CODES",
    "MASSAGE_CONTROLLED_E2E_CANDIDATES",
    'process.env.STAYHUB_MASSAGE_API_URL ||',
    'process.env.STAYHUB_MASSAGE_API_TOKEN ||',
  ]) {
    assertNotContains(massageApi, fragment);
  }
  for (const literal of ["aquamarin", "aquamarine", "sunny-castle", "sunnycastle"]) {
    assertNotContains(massageApi, literal);
  }

  for (const fragment of [
    'from("massage_external_source_configs")',
    '.eq("hotel_id", hotel.id)',
    "adapter_key",
    "hotel_code",
    "read_enabled",
    "mirror_enabled",
  ]) {
    assertContains(adapterConfig, fragment);
  }

  assertContains(snapshotCron, "listMassageExternalReadHotels");
  assertNotContains(snapshotCron, "STAYHUB_MASSAGE_SNAPSHOT_HOTELS");
  assertNotContains(workflow, "hotelSlug=aquamarin");
  assertNotContains(workflow, "/api/cron/massage-sheet-sync?");
  assertContains(workflow, "/api/cron/massage-snapshot-sync");
});

test("M14.4 generic certification tenant is data-only, six-language and has no external Sheet source", async () => {
  const fixture = await readFixture();
  const validation = validateHotelOnboardingFixture(fixture);
  assert.deepEqual(validation, { ok: true, errors: [], warnings: [] });
  assert.equal(fixture.slug, "certification-hotel");
  assert.equal(fixture.publicSlug, "certification-hotel-public");
  assert.deepEqual(new Set(fixture.languages), new Set(["bg", "en", "de", "ro", "cs", "ru"]));
  assert.equal(fixture.externalMassageSource, null);

  const serialized = JSON.stringify(fixture).toLowerCase();
  assert.equal(serialized.includes("aquamarin"), false);
  assert.equal(serialized.includes("sunny castle"), false);
  assert.equal(serialized.includes("script.google"), false);
});

test("M14.4 migration seeds the certification tenant and explicit external-source boundaries", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260815113000_m14_4_generic_third_hotel_proof.sql",
  );

  for (const fragment of [
    "create table if not exists public.massage_external_source_configs",
    "certification-hotel",
    "certification-hotel-public",
    "massage_runtime_authority_state",
    "massage_runtime_services",
    "massage_runtime_schedules",
    "staff_access_pins",
    "hotel_config_revisions",
    "hotel_config_publication_state",
  ]) {
    assertContains(migration, fragment);
  }

  assertContains(migration, "read_enabled boolean not null default false");
  assertContains(migration, "mirror_enabled boolean not null default false");
  assertNotContains(migration, "script.google.com");
});
