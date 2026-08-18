import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectMassageNativeAvailabilityPages,
  MASSAGE_NATIVE_AVAILABILITY_PAGE_SIZE,
} from "../../lib/server/massage-native-pagination.mjs";

const nativeRuntime = readFileSync(
  new URL("../../lib/server/massage-native-runtime.ts", import.meta.url),
  "utf8",
);

function buildRows() {
  const serviceCounts = [
    ["whole_body", 300],
    ["partial", 352],
    ["reflexotherapy", 352],
    ["head", 352],
    ["aroma", 300],
    ["anti_stress", 300],
    ["relax", 300],
    ["sports", 300],
  ];
  const rows = [];

  for (const [serviceId, count] of serviceCounts) {
    for (let index = 0; index < count; index += 1) {
      const day = 18 + (index % 14);
      const quarter = index % 32;
      const hour = 9 + Math.floor(quarter / 4);
      const minute = (quarter % 4) * 15;
      rows.push({
        serviceId,
        date: `2026-08-${String(day).padStart(2, "0")}`,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      });
    }
  }

  return rows;
}

test("native massage availability pagination crosses the 1000-row boundary without cutting later services", async () => {
  const sourceRows = buildRows();
  assert.equal(sourceRows.length, 2556);

  const firstPageOnly = sourceRows.slice(0, MASSAGE_NATIVE_AVAILABILITY_PAGE_SIZE);
  assert.equal(firstPageOnly.filter((row) => row.serviceId === "reflexotherapy").length, 348);
  assert.equal(firstPageOnly.filter((row) => row.serviceId === "head").length, 0);

  const requestedRanges = [];
  const collected = await collectMassageNativeAvailabilityPages(
    async ({ from, to }) => {
      requestedRanges.push([from, to]);
      return sourceRows.slice(from, to + 1);
    },
  );

  assert.deepEqual(requestedRanges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  assert.deepEqual(collected, sourceRows);

  const expectedCounts = new Map([
    ["whole_body", 300],
    ["partial", 352],
    ["reflexotherapy", 352],
    ["head", 352],
    ["aroma", 300],
    ["anti_stress", 300],
    ["relax", 300],
    ["sports", 300],
  ]);

  for (const [serviceId, expectedCount] of expectedCounts) {
    const serviceRows = collected.filter((row) => row.serviceId === serviceId);
    assert.equal(serviceRows.length, expectedCount, `${serviceId} availability must not be truncated`);
    assert.ok(serviceRows.some((row) => row.date === "2026-08-18"));
    assert.ok(serviceRows.some((row) => row.time === "09:00"));
    assert.ok(serviceRows.every((row) => row.serviceId === serviceId));
  }
});

test("native runtime applies paging only to availability reads and preserves exact service filtering", () => {
  assert.match(nativeRuntime, /collectMassageNativeAvailabilityPages/);
  assert.match(nativeRuntime, /get_massage_runtime_availability_window/);
  assert.match(nativeRuntime, /\.range\(from, to\)/);
  assert.match(nativeRuntime, /if \(row\.serviceId !== input\.service\.serviceId\) continue;/);

  const bookingSection = nativeRuntime.slice(
    nativeRuntime.indexOf("export async function createSandboxNativeMassageBooking"),
  );
  assert.match(bookingSection, /create_sandbox_massage_runtime_booking/);
  assert.match(bookingSection, /cancel_sandbox_massage_runtime_booking/);
  assert.doesNotMatch(bookingSection, /collectMassageNativeAvailabilityPages|\.range\(from, to\)/);
});
