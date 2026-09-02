import assert from "node:assert/strict";
import test from "node:test";
import { assertContains, readProjectFile } from "../helpers/source-contract.mjs";

test("published hotel config uses a bounded tenant cache with fail-open cache transport", async () => {
  const source = await readProjectFile("lib/server/published-hotel-config.ts");
  assertContains(source, 'getCache({ namespace: "published-hotel-config-v1" })');
  assertContains(source, "PUBLISHED_CONFIG_CACHE_TTL_SECONDS = 10");
  assertContains(source, '`hotel-config:${normalizedHotelId}`');
  assertContains(source, "cache read failed; using authoritative database path");
  assertContains(source, "cache write failed; continuing with authoritative result");
});

test("cache serialization restores server-only relational authority", async () => {
  const source = await readProjectFile("lib/server/published-hotel-config.ts");
  assertContains(source, "getGuestRequestRelationalAuthority(snapshot.config)");
  assertContains(source, "attachGuestRequestRelationalAuthority(config, cached.relationalAuthority)");
  assertContains(source, "structuredClone(cached.config)");
});

test("hotel config overlaps published-config and test-room reads", async () => {
  const source = await readProjectFile("lib/config.ts");
  const parallelStart = source.indexOf("const [published, testRoomNumbers] = await Promise.all([");
  const resolvedConfig = source.indexOf("const resolvedConfig: HotelConfig = {");
  assert.ok(parallelStart >= 0);
  assert.ok(resolvedConfig > parallelStart);
});
