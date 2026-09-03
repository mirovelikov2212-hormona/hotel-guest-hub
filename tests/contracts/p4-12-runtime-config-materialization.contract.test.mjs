import assert from "node:assert/strict";
import test from "node:test";

import { prepareFactoryGuestRuntimeConfig } from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";
import { prepareFactoryOnboardingEnvelope } from "../../lib/product-factory/factory-onboarding-envelope-model.mjs";
import { resolveGuestRequestAuthority } from "../../lib/server/guest-request-authority.mjs";
import { allInclusiveResortBlueprint, boutiqueHotelBlueprint } from "../fixtures/product-factory/p0-scenarios.mjs";
import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

test("P4.12 materializes a deterministic top-level Guest runtime candidate from a generic blueprint", () => {
  const first = prepareFactoryGuestRuntimeConfig({ blueprint: structuredClone(allInclusiveResortBlueprint) });
  const second = prepareFactoryGuestRuntimeConfig({ blueprint: structuredClone(allInclusiveResortBlueprint) });

  assert.equal(first.schemaVersion, "p4.12-guest-runtime-v1");
  assert.equal(first.status, "materialized");
  assert.equal(first.configHash, second.configHash);
  assert.match(first.configHash, /^[a-f0-9]{64}$/);
  assert.equal(first.config.hotelName, "Future Coast Resort");
  assert.equal(first.config.hotelTimezone, "Europe/Istanbul");
  assert.deepEqual(first.config.languages, ["tr", "en", "de", "ru", "ar", "pl", "ro"]);
  assert.equal(first.config.hotelRooms.length, 500);
  assert.equal(first.config.validRoomNumbers.length, 500);
  assert.equal(first.config.coverImage, "/images/stayhub-factory-placeholder-hero.svg");
  assert.deepEqual(first.config.venueRows, []);
  assert.deepEqual(first.config.hotelInfoItems, []);
});

test("P4.12 carries exact hotel coordinates into Weather and keeps the capability hotel-scoped", async () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  blueprint.property.location = {
    query: "Sydney Harbour Hotel, Sydney, Australia",
    latitude: -33.8688,
    longitude: 151.2093,
  };
  blueprint.property.timezone = "Australia/Sydney";

  const result = prepareFactoryGuestRuntimeConfig({ blueprint });

  assert.equal(result.config.weatherEnabled, true);
  assert.equal(result.config.hotelLatitude, -33.8688);
  assert.equal(result.config.hotelLongitude, 151.2093);
  assert.equal(result.config.location.lat, -33.8688);
  assert.equal(result.config.location.lng, 151.2093);
  assert.equal(result.config.location.query, "Sydney Harbour Hotel, Sydney, Australia");
  assert.equal(result.config.hotelTimezone, "Australia/Sydney");

  const weatherRoute = await readProjectFile("app/api/weather/route.ts");
  assertContains(weatherRoute, 'forecastUrl.searchParams.set("timezone", "auto")');
  assertContains(weatherRoute, 'params.get("tz") || "auto"');
  assertNotContains(weatherRoute, 'params.get("tz") || "UTC"');
});

test("P4.12 maps Product Factory services and custom departments into Guest request definitions", () => {
  const result = prepareFactoryGuestRuntimeConfig({ blueprint: structuredClone(allInclusiveResortBlueprint) });
  const byId = new Map(result.config.requestDefs.map((item) => [item.id, item]));

  assert.equal(byId.get("massage")?.targetDepartment, "spa");
  assert.equal(byId.get("massage")?.requestType, "massage");
  assert.equal(byId.get("massage")?.guestVisible, true);
  assert.equal(byId.get("beach-cabana")?.targetDepartment, "pool");
  assert.equal(byId.get("beach-cabana")?.requiresBilling, true);
  assert.equal(byId.get("beach-cabana")?.confirmationMode, "staff_required");
  assert.equal(result.config.departmentHours.spa.open, "09:00");
  assert.equal(result.config.departmentHours.spa.close, "20:00");
  assert.equal(result.config.departmentHours.reception.open, "00:00");
  assert.equal(result.config.departmentHours.reception.close, "23:59");
});

test("P4.12 hides a service without a real target department instead of routing it by fallback", () => {
  const blueprint = structuredClone(boutiqueHotelBlueprint);
  blueprint.services.push({ id: "external-info", mode: "configurable" });
  const result = prepareFactoryGuestRuntimeConfig({ blueprint });
  const service = result.config.requestDefs.find((item) => item.id === "external-info");

  assert.equal(service?.targetDepartment, "none");
  assert.equal(service?.guestVisible, false);
  assert.equal(service?.enabled, false);
});

test("P4.12 binds the exact Guest runtime hash and payload into the immutable P2.4 envelope", () => {
  const result = prepareFactoryOnboardingEnvelope({ blueprint: structuredClone(boutiqueHotelBlueprint) });
  const guestRuntime = result.envelope.guest_runtime;

  assert.equal(guestRuntime.schema_version, "p4.12-guest-runtime-v1");
  assert.equal(guestRuntime.status, "materialized");
  assert.equal(guestRuntime.config_hash, result.guestRuntimeHash);
  assert.equal(guestRuntime.config.hotelName, "Boutique Thirty");
  assert.equal(guestRuntime.config.validRoomNumbers.length, 30);
  assert.equal(result.counts.guestRuntimeRooms, 30);
});

test("P4.12 guest request authority accepts tenant-defined departments but rejects reserved pseudo roles", () => {
  const base = {
    id: "beach-cabana",
    type: "request",
    enabled: true,
    guestVisible: true,
    requestType: "beach-cabana",
  };
  const accepted = resolveGuestRequestAuthority({
    requestDefs: [{ ...base, targetDepartment: "pool", afterHoursDepartment: "guest-relations" }],
    rawType: "beach-cabana",
    sourceRequestDef: "beach-cabana",
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.department, "pool");
  assert.equal(accepted.afterHoursDepartment, "guest_relations");

  const reserved = resolveGuestRequestAuthority({
    requestDefs: [{ ...base, targetDepartment: "manager" }],
    rawType: "beach-cabana",
    sourceRequestDef: "beach-cabana",
  });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.department, null);
});

test("P4.12 Guest write preserves tenant service identity for relational routing and persistence", async () => {
  const route = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(route, "const legacyNormalizedType = normalizeStaffRequestType(");
  assertContains(route, "const authoritativeRequestType = requestAuthority.sourceRequestDef");
  assertContains(route, "requestType: authoritativeRequestType");
  assertContains(route, "request_type: authoritativeRequestType");
  assertContains(route, "canonicalRequestType: legacyNormalizedType");
  assertContains(route, "authoritativeRequestType,");
  assertContains(route, "const role = normalizePushRole(value)");
  assertContains(route, "roles.add(role)");
  assertNotContains(route, 'value === "housekeeping" || value === "maintenance"');
});

test("P4.12 tracking keeps legacy extra environment aligned with authoritative hotel scope", async () => {
  const route = await readProjectFile("app/api/track/route.ts");
  const resolvedExtraStart = route.indexOf("const resolvedExtra = {");
  const legacyPayloadStart = route.indexOf("const legacyPayload = {");

  assert.ok(resolvedExtraStart >= 0);
  assert.ok(legacyPayloadStart > resolvedExtraStart);
  const resolvedExtraBlock = route.slice(resolvedExtraStart, legacyPayloadStart);
  assertContains(resolvedExtraBlock, "...legacyExtra,");
  assertContains(resolvedExtraBlock, "environment: resolvedEnvironment,");
  assertContains(route, "extra: resolvedExtra,");
  assertNotContains(route, "extra: legacyExtra,");
});

test("P4.12 DB guard materializes only future Factory revision 4 and fails closed on malformed candidates", async () => {
  const migration = await readProjectFile("supabase/migrations/20260818194000_p4_12_factory_guest_runtime_materialization.sql");

  assertContains(migration, "materialize_factory_guest_runtime_revision_v1");
  assertContains(migration, "before insert on public.hotel_config_revisions");
  assertContains(migration, "new.source_type = 'factory_blueprint' and new.revision_no = 4");
  assertContains(migration, "P4_12_GUEST_RUNTIME_MATERIALIZATION_MISSING");
  assertContains(migration, "P4_12_GUEST_RUNTIME_SHAPE_INVALID");
  assertContains(migration, "P4_12_GUEST_RUNTIME_ROOM_COUNT_INVALID");
  assertContains(migration, "P4_12_GUEST_RUNTIME_REQUEST_DEF_INVALID");
  assertContains(migration, "new.config_json := v_runtime_config || new.config_json");
  assertContains(migration, "guestRuntimeMaterialized");
  assertNotContains(migration.toLowerCase(), "update public.hotels");
  assertNotContains(migration.toLowerCase(), "update public.properties");
  assertNotContains(migration.toLowerCase(), "published_revision_id");
  assertNotContains(migration.toLowerCase(), "factory_production_live_activation_runs");
});

test("P4.12 remains hotel-generic and does not materialize Aquamarine identity/content", async () => {
  const model = await readProjectFile("lib/product-factory/factory-guest-runtime-config-model.mjs");
  for (const forbidden of ["aquamarine", "aquamarin", "kranevo", "Europe/Sofia", "Hotel Aquamarine"]) {
    assertNotContains(model.toLowerCase(), forbidden.toLowerCase());
  }
});

test("P4.12 materialized Sandbox hot path primes process memory without blocking on persisted cache fan-out", async () => {
  const directory = await readProjectFile("lib/hotels/getHotelSheetSources.ts");
  const published = await readProjectFile("lib/server/published-hotel-config.ts");
  const normalized = await readProjectFile("lib/server/normalized-config-runtime.ts");

  assertContains(directory, "await primeSharedRuntimeCaches(materialized);");
  assertNotContains(
    directory,
    "await Promise.all([\n        cacheHotelSheetSources(cacheKey, result),\n        primeSharedRuntimeCaches(materialized),\n      ]);",
  );

  assertContains(published, "publishedConfigMemoryCache");
  assertContains(published, "const memoryCached = readPublishedRuntimeMemoryCache(normalizedHotelId);");
  const publishedPrimeStart = published.indexOf("export async function primePublishedHotelConfigRuntimeCache");
  const publishedPrimeEnd = published.indexOf("/**\n * Read only the immutable published revision", publishedPrimeStart);
  assert.ok(publishedPrimeStart >= 0 && publishedPrimeEnd > publishedPrimeStart);
  const publishedPrime = published.slice(publishedPrimeStart, publishedPrimeEnd);
  assertContains(publishedPrime, "writePublishedRuntimeMemoryCache");
  assertNotContains(publishedPrime, "writePublishedRuntimeCache(");

  assertContains(normalized, "normalizedRuntimeMemoryCache");
  assertContains(normalized, "const memoryCached = readNormalizedRuntimeMemoryCache(key);");
  const normalizedPrimeStart = normalized.indexOf("export async function primeNormalizedRuntimeCachesFromMaterialized");
  const normalizedPrimeEnd = normalized.indexOf("function metadataActivatesRoomReads", normalizedPrimeStart);
  assert.ok(normalizedPrimeStart >= 0 && normalizedPrimeEnd > normalizedPrimeStart);
  const normalizedPrime = normalized.slice(normalizedPrimeStart, normalizedPrimeEnd);
  assertContains(normalizedPrime, "writeNormalizedRuntimeMemoryCache");
  assertNotContains(normalizedPrime, "writeNormalizedRuntimeCache(");
});
