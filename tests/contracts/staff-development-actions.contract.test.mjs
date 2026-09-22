import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Staff Development actions derive hotel and actor identity from the development session", async () => {
  const source = await readProjectFile("lib/server/staff-development-actions.ts");

  for (const fragment of [
    "requireStaffDevelopmentIdentity(input.hotelSlug)",
    "identity.hotelId",
    "identity.staffUserId",
    "identity.staffUserRole",
    "identity.departmentId",
    "identity.operationalRole",
  ]) {
    assertContains(source, fragment);
  }

  for (const forbidden of [
    "input.hotelId",
    "input.staffUserId",
    "input.reviewerStaffUserId",
    "input.assignedByStaffUserId",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("Department managers are restricted to their own department while hotel managers retain hotel scope", async () => {
  const source = await readProjectFile("lib/server/staff-development-actions.ts");

  for (const fragment of [
    'identity.staffUserRole === "hotel_manager"',
    "identity.departmentId !== target.departmentId",
    'target.role === "hotel_manager"',
    '"STAFF_DEVELOPMENT_MANAGER_SCOPE_FORBIDDEN"',
    'standardScope === "hotel"',
    'standardScope !== "department"',
    "departments.length !== 1",
    "departments[0] !== input.identity.operationalRole",
    "allowHotelScopeForDepartmentManager: true",
  ]) {
    assertContains(source, fragment);
  }
});

test("Staff Development revision numbers and timestamps are server-controlled", async () => {
  const source = await readProjectFile("lib/server/staff-development-actions.ts");

  for (const fragment of [
    "nextRevisionNo({",
    'status: "published"',
    "assignedAt: new Date().toISOString()",
    "completedAt: new Date().toISOString()",
    "reviewedAt: new Date().toISOString()",
  ]) {
    assertContains(source, fragment);
  }

  for (const forbidden of [
    "input.revisionNo",
    "input.assignedAt",
    "input.completedAt",
    "input.reviewedAt",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("HR rule publication requires individual hotel-manager identity", async () => {
  const source = await readProjectFile("lib/server/staff-development-actions.ts");

  assertContains(source, 'identity.staffUserRole !== "hotel_manager"');
  assertContains(source, '"STAFF_HR_HOTEL_MANAGER_REQUIRED"');
});
