import assert from "node:assert/strict";
import test from "node:test";

import {
  HOTEL_CONFIG_REVISION_STATUSES,
  HOTEL_CONFIG_SOURCE_TYPES,
  normalizePublishedHotelConfigRuntime,
  validateHotelConfigRevisionEnvelope,
  validatePublishedHotelConfigRuntimeShape,
} from "../../lib/hotels/config-revision-contract.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const validEnvelope = {
  hotelId: "00000000-0000-0000-0000-000000000001",
  status: "draft",
  sourceType: "sheet_snapshot",
  sourceChecksum: "a".repeat(64),
  config: {
    hotelName: "Example Hotel",
    languages: ["bg", "en"],
  },
  provenance: {
    hotelName: {
      source: "hotel_setup_csv",
      key: "Hotel Name",
    },
  },
  sourceMetadata: {
    importedAt: "2026-08-11T00:00:00.000Z",
  },
  validation: {
    ok: true,
    errors: [],
    warnings: [],
  },
};

const legacyMinimalRequestDef = {
  id: "extra-towel",
  type: "request",
  title: { en: "Extra towel" },
  enabled: true,
  staffLabel: { en: "Extra towel" },
  requestType: "extra-towel",
  guestVisible: true,
  staffVisible: true,
  targetDepartment: "housekeeping",
};

function canonicalRequestDef() {
  return {
    id: "extra-towel",
    type: "request",
    category: "housekeeping",
    enabled: true,
    sortOrder: 1,
    requestKind: "standard",
    targetDepartment: "housekeeping",
    requestType: "extra-towel",
    requiresNote: false,
    requiresQuantity: false,
    requiresTime: false,
    timeMode: "none",
    options: [],
    guestVisible: true,
    staffVisible: true,
    aiVisible: true,
    confirmationMode: "instant",
    title: { en: "Extra towel" },
    subtitle: {},
    description: {},
    policy: {},
    success: { en: "Request sent" },
    staffLabel: { en: "Extra towel" },
    keywords: ["extra-towel", "Extra towel"],
  };
}

test("M9/M11 revision lifecycle vocabulary stays explicit and finite", () => {
  assert.deepEqual(HOTEL_CONFIG_REVISION_STATUSES, [
    "draft",
    "published",
    "superseded",
    "invalid",
  ]);

  assert.deepEqual(HOTEL_CONFIG_SOURCE_TYPES, [
    "sheet_snapshot",
    "manual",
    "local_demo",
    "production_clone",
  ]);
});

test("valid configuration revision envelope passes foundation validation", () => {
  assert.deepEqual(validateHotelConfigRevisionEnvelope(validEnvelope), {
    ok: true,
    errors: [],
  });
});

test("malformed revision envelope fails before publish/import code can use it", () => {
  const result = validateHotelConfigRevisionEnvelope({
    ...validEnvelope,
    status: "published",
    sourceType: "unknown",
    sourceChecksum: "not-a-sha256",
    config: null,
    provenance: [],
    sourceMetadata: null,
    validation: {
      ok: false,
      errors: ["BROKEN"],
    },
  });

  assert.equal(result.ok, false);

  for (const expected of [
    "REVISION_SOURCE_TYPE_INVALID",
    "REVISION_CONFIG_OBJECT_REQUIRED",
    "REVISION_PROVENANCE_OBJECT_REQUIRED",
    "REVISION_SOURCE_METADATA_OBJECT_REQUIRED",
    "REVISION_SOURCE_CHECKSUM_INVALID",
    "PUBLISHED_REVISION_MUST_BE_VALID",
  ]) {
    assert.ok(result.errors.includes(expected), `Missing validation error: ${expected}`);
  }
});

test("published runtime compatibility normalizes legacy presentation fields without mutating immutable input", () => {
  const input = {
    hotelName: "Factory Heavy 91",
    languages: ["en"],
    requestDefs: [structuredClone(legacyMinimalRequestDef)],
  };
  const before = structuredClone(input);

  const result = normalizePublishedHotelConfigRuntime(input);
  const definition = result.config.requestDefs[0];

  assert.deepEqual(input, before, "Runtime compatibility must never rewrite the immutable revision payload");
  assert.equal(definition.id, "extra-towel");
  assert.equal(definition.targetDepartment, "housekeeping");
  assert.equal(definition.requestType, "extra-towel");
  assert.equal(definition.category, "services");
  assert.equal(definition.sortOrder, 1);
  assert.equal(definition.requestKind, "standard");
  assert.equal(definition.requiresNote, false);
  assert.equal(definition.requiresQuantity, false);
  assert.equal(definition.requiresTime, false);
  assert.equal(definition.timeMode, "none");
  assert.deepEqual(definition.options, []);
  assert.equal(definition.aiVisible, false);
  assert.equal(definition.confirmationMode, "instant");
  assert.deepEqual(definition.subtitle, {});
  assert.deepEqual(definition.description, {});
  assert.deepEqual(definition.policy, {});
  assert.deepEqual(definition.success, {});
  assert.deepEqual(definition.staffLabel, { en: "Extra towel" });
  assert.deepEqual(definition.keywords, []);
  assert.ok(result.compatibilityDefaultsApplied.includes("extra-towel.keywords"));
  assert.ok(result.compatibilityDefaultsApplied.includes("extra-towel.requestKind"));
});

test("published runtime compatibility rejects malformed field types instead of coercing them", () => {
  assert.throws(
    () =>
      normalizePublishedHotelConfigRuntime({
        hotelName: "Broken Hotel",
        languages: ["en"],
        requestDefs: [
          {
            ...legacyMinimalRequestDef,
            keywords: "extra towel",
          },
        ],
      }),
    /PUBLISHED_REQUEST_DEF_FIELD_INVALID:extra-towel:keywords/,
  );
});

test("new published revisions require canonical RequestDef fields while legacy reads may use explicit compatibility defaults", () => {
  const legacyShape = validatePublishedHotelConfigRuntimeShape(
    { requestDefs: [structuredClone(legacyMinimalRequestDef)] },
    { requireCanonicalRequestDefs: true },
  );
  assert.equal(legacyShape.ok, false);
  assert.ok(legacyShape.errors.includes("PUBLISHED_REQUEST_DEF_CANONICAL_FIELDS_REQUIRED"));

  const canonicalShape = validatePublishedHotelConfigRuntimeShape(
    { requestDefs: [canonicalRequestDef()] },
    { requireCanonicalRequestDefs: true },
  );
  assert.equal(canonicalShape.ok, true);
  assert.deepEqual(canonicalShape.errors, []);
  assert.deepEqual(canonicalShape.compatibilityDefaultsApplied, []);

  const publishedEnvelope = validateHotelConfigRevisionEnvelope({
    ...validEnvelope,
    status: "published",
    config: {
      ...validEnvelope.config,
      requestDefs: [structuredClone(legacyMinimalRequestDef)],
    },
  });
  assert.equal(publishedEnvelope.ok, false);
  assert.ok(
    publishedEnvelope.errors.includes("PUBLISHED_REQUEST_DEF_CANONICAL_FIELDS_REQUIRED"),
  );
});

test("published runtime compatibility never invents routing authority", () => {
  assert.throws(
    () =>
      normalizePublishedHotelConfigRuntime({
        requestDefs: [
          {
            ...legacyMinimalRequestDef,
            targetDepartment: undefined,
          },
        ],
      }),
    /PUBLISHED_REQUEST_DEF_FIELD_INVALID:extra-towel:targetDepartment/,
  );
});

test("M9 runtime resolves non-demo hotels through published snapshots", async () => {
  const configSource = await readProjectFile("lib/config.ts");
  const publishedSource = await readProjectFile(
    "lib/server/published-hotel-config.ts",
  );

  assertContains(configSource, "getPublishedHotelConfigSnapshot");
  assertContains(configSource, "export async function getHotelConfigFromSheets");
  assertContains(configSource, 'if (safeHotelSlug === "demo")');
  assertContains(configSource, "Missing published hotel configuration revision");

  assertContains(publishedSource, '.from("hotel_config_publication_state")');
  assertContains(publishedSource, '.from("hotel_config_revisions")');
  assertContains(publishedSource, '.eq("hotel_id", normalizedHotelId)');
  assertContains(publishedSource, 'row.status !== "published"');
  assertContains(publishedSource, "row.validation_json.ok !== true");
});

test("published JSON is normalized only at the runtime boundary, never in the projection source", async () => {
  const publishedSource = await readProjectFile("lib/server/published-hotel-config.ts");

  assertContains(publishedSource, "normalizePublishedHotelConfigRuntime");
  assertContains(publishedSource, 'namespace: "published-hotel-config-v2"');
  assertContains(publishedSource, "const config = normalizeRuntimeConfig(structuredClone(base.config)");
  assertContains(publishedSource, "config: base.config,");
  assertContains(publishedSource, "Runtime compatibility defaults are applied only in loadPublishedHotelConfigSnapshot");
  assertNotContains(
    publishedSource,
    "row.config_json =",
    "Runtime compatibility must not rewrite immutable revision JSON.",
  );
});

test("non-demo sheet imports cannot use legacy global room or hotel-info fallbacks", async () => {
  const source = await readProjectFile("lib/config.ts");

  assertContains(source, "const legacyGlobalHotelInfoUrl =");
  assertContains(source, "const legacyGlobalRoomsUrl =");
  assertContains(source, 'safeHotelSlug === "demo"');
});
