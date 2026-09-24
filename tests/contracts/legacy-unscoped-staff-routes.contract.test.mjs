import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const legacyRoutes = [
  "app/staff/page.tsx",
  "app/staff/reception/page.tsx",
  "app/staff/housekeeping/page.tsx",
  "app/staff/maintenance/page.tsx",
  "app/staff/manager/page.tsx",
];

test("legacy unscoped Staff routes fail closed", async () => {
  for (const path of legacyRoutes) {
    const source = await readProjectFile(path);

    assertContains(source, 'from "next/navigation"');
    assertContains(source, "notFound()");
    assertNotContains(source, '"use client"');
    assertNotContains(source, "@/lib/staff/mock-data");
    assertNotContains(source, "useStaffStore");
  }
});

test("legacy Staff surface contains no client-side supervisor credential", async () => {
  const housekeeping = await readProjectFile("app/staff/housekeeping/page.tsx");

  assert.equal(housekeeping.includes("2580"), false);
  assert.equal(housekeeping.includes("HOUSEKEEPING_SUPERVISOR_PIN"), false);
  assert.equal(housekeeping.includes("sessionStorage"), false);
});

test("hotel-scoped Staff layout remains the only store tenant authority boundary", async () => {
  const rootLayout = await readProjectFile("app/staff/layout.tsx");
  const layout = await readProjectFile("app/staff/[hotelSlug]/layout.tsx");
  const genericDepartment = await readProjectFile(
    "app/staff/[hotelSlug]/[departmentCode]/page.tsx",
  );

  assertNotContains(rootLayout, "StaffStoreProvider");
  assertContains(layout, "getHotelByAnySlug(hotelSlug)");
  assertContains(layout, "<StaffStoreProvider hotelSlug={hotelSlug} hotelId={hotel.id}>");
  assertContains(genericDepartment, "requireStaffAccess(hotelSlug, role)");
});
