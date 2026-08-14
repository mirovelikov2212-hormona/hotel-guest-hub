import assert from "node:assert/strict";
import test from "node:test";

import {
  HOTEL_CONFIG_REVISION_STATUSES,
  HOTEL_CONFIG_SOURCE_TYPES,
  validateHotelConfigRevisionEnvelope,
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

test("non-demo sheet imports cannot use legacy global room or hotel-info fallbacks", async () => {
  const source = await readProjectFile("lib/config.ts");

  assertContains(source, "const legacyGlobalHotelInfoUrl =");
  assertContains(source, "const legacyGlobalRoomsUrl =");
  assertContains(source, 'safeHotelSlug === "demo"');
});
