import test from "node:test";

import {
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("staff massage feed is hotel scoped and only exposes reception manager or spa", async () => {
  const source = await readProjectFile("app/api/staff/massage-reservations/route.ts");

  assertContains(source, '.eq("hotel_id", scope.hotelId)');
  assertContains(source, '.eq("request_type", "massage_booking")');
  assertContains(source, 'role === "reception" || role === "manager"');
  assertContains(source, 'scope.departmentCode !== "spa"');
  assertContains(source, "canManageBilling: false");
});

test("massage reservations module is present in reception manager and SPA panels", async () => {
  const reception = await readProjectFile("components/staff/pages/ReceptionPageContent.tsx");
  const manager = await readProjectFile("components/staff/pages/ManagerPageContent.tsx");
  const generic = await readProjectFile("components/staff/pages/GenericDepartmentPageContent.tsx");

  assertContains(reception, '<StaffMassageReservationsPanel hotelSlug={hotelSlug} role="reception" />');
  assertContains(manager, '<StaffMassageReservationsPanel hotelSlug={hotelSlug} role="manager" />');
  assertContains(generic, 'departmentCode === "spa"');
  assertContains(generic, '<StaffMassageReservationsPanel hotelSlug={hotelSlug} role={departmentCode} />');
});

test("new massage bookings notify configured SPA while reception and manager retain visibility", async () => {
  const source = await readProjectFile("lib/server/massage-staff-request.ts");

  assertContains(source, '.eq("code", "spa")');
  assertContains(source, 'notifyDepartments = ["reception", "manager", ...(spaRole ? [spaRole] : [])]');
  assertContains(source, "department_id: departmentId");
  assertContains(source, 'targetRoles: ["reception", ...(spaRole ? [spaRole] : [])]');
});
