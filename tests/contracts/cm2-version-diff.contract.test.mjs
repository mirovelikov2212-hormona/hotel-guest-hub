import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildHotelConfigVersionDiff } from "../../lib/server/factory-production-version-diff.mjs";

test("CM2 categorizes deterministic semantic changes without exposing collection identity", () => {
  const current = {
    theme: { mode: "light" },
    departmentHours: { reception: { open: "07:00", close: "23:00" } },
    requestDefs: [{ id: "late-checkout", requestType: "late_checkout", targetDepartment: "reception", title: "Late checkout" }],
    venueRows: [{ id: "pool-bar", name: "Pool Bar", enabled: true }],
    hotelInfoItems: [{ id: "pets", value: "No pets" }],
    i18n: { en: { hello: "Hello" } },
    testModeEnabled: false,
  };
  const candidate = {
    testModeEnabled: true,
    i18n: { en: { hello: "Hi" } },
    hotelInfoItems: [{ id: "pets", value: "Pets by request" }],
    venueRows: [{ id: "pool-bar", name: "Pool Bar", enabled: false }],
    requestDefs: [{ id: "late-checkout", requestType: "late_checkout", targetDepartment: "housekeeping", title: "Late checkout plus" }],
    departmentHours: { reception: { open: "08:00", close: "23:00" } },
    theme: { mode: "dark" },
  };

  const diff = buildHotelConfigVersionDiff(current, candidate);
  assert.equal(diff.changed, true);
  assert.deepEqual(diff.changedCategories, [
    "content",
    "services",
    "routing",
    "hours",
    "policies",
    "venues",
    "design",
    "operational_settings",
  ]);
  assert.match(diff.diffHash, /^[a-f0-9]{64}$/);
  assert.ok(diff.changes.some((change) => change.category === "routing" && change.path.endsWith(".targetDepartment")));
  assert.ok(diff.changes.some((change) => change.category === "services" && change.path.endsWith(".title")));
  assert.ok(diff.changes.every((change) =>
    !change.path.includes("late-checkout")
    && !change.path.includes("pool-bar")
    && !change.path.includes("pets")
  ));
});

test("CM2 ignores pure collection reorder and produces stable hashes", () => {
  const reordered = buildHotelConfigVersionDiff(
    {
      hotelRooms: [{ roomNumber: "101", active: true }, { roomNumber: "102", active: true }],
      languages: ["bg", "en"],
    },
    {
      hotelRooms: [{ roomNumber: "102", active: true }, { roomNumber: "101", active: true }],
      languages: ["en", "bg"],
    },
  );
  assert.equal(reordered.changed, false);
  assert.equal(reordered.totalChanges, 0);

  const first = buildHotelConfigVersionDiff({ theme: { a: 1, b: 2 } }, { theme: { a: 2, b: 2 } });
  const second = buildHotelConfigVersionDiff({ theme: { b: 2, a: 1 } }, { theme: { b: 2, a: 2 } });
  assert.equal(first.diffHash, second.diffHash);
  assert.deepEqual(first.changes, second.changes);
});

test("CM2 Readiness derives current LIVE and stores exact diff evidence server side", async () => {
  const helper = await readFile(resolve(process.cwd(), "lib/server/factory-production-version-readiness.ts"), "utf8");
  assert.match(helper, /from\("hotel_config_publication_state"\)/);
  assert.match(helper, /published_revision_id,last_known_good_revision_id/);
  assert.match(helper, /\.eq\("hotel_id", productionHotelId\)/);
  assert.match(helper, /buildHotelConfigVersionDiff\(currentLive\.config_json, source\.config_json\)/);
  assert.match(helper, /CM2_VERSION_NO_SEMANTIC_CHANGE/);
  assert.match(helper, /change_diff_derived: true/);
  assert.match(helper, /schemaVersion: "cm2-version-readiness-diff-v1"/);
  assert.match(helper, /rowCurrentLiveRevisionId !== expectedCurrentLiveRevisionId/);
  assert.doesNotMatch(helper, /currentLiveConfig: unknown/);
  assert.doesNotMatch(helper, /expectedCurrentLiveRevisionId: unknown/);
});
