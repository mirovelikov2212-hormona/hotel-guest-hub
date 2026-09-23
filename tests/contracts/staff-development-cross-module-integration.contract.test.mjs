import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Staff module availability derives hotel authority from active Staff session", () => {
  const server = readFileSync(
    new URL("../../lib/server/staff-module-availability.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/staff/modules/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /getCurrentStaffSession\(hotelSlug, role\)/);
  assert.match(
    server,
    /String\(hotel\.id\) !== String\(session\.hotel_id\)/,
  );
  assert.match(server, /session\.role !== role/);
  assert.match(server, /getHotelProductModuleEntitlement/);
  assert.match(server, /resolveStaffRuntimeRoleForHotelId/);
  assert.doesNotMatch(route, /hotelId/);
  assert.doesNotMatch(route, /staffUserId/);
});

test("cross-module card exposes navigation only when Staff Development is entitled", () => {
  const card = readFileSync(
    new URL(
      "../../components/staff/StaffDevelopmentAccessCard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(card, /body\.availability\?\.modules\.staffDevelopment/);
  assert.match(card, /if \(!availability\?\.modules\.staffDevelopment\) return null/);
  assert.match(card, /managerIntelligence/);
  assert.match(card, /\/development/);
  assert.doesNotMatch(card, /\/api\/staff\/development\/state/);
  assert.doesNotMatch(card, /\/api\/staff\/development\/identity/);
});

test("Manager and department operational workspaces link into the shared development module", () => {
  const manager = readFileSync(
    new URL(
      "../../components/staff/pages/ManagerPageContent.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const department = readFileSync(
    new URL(
      "../../components/staff/pages/GenericDepartmentPageContent.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(manager, /StaffDevelopmentAccessCard/);
  assert.match(
    manager,
    /StaffDevelopmentAccessCard hotelSlug=\{hotelSlug\} role="manager"/,
  );
  assert.match(department, /StaffDevelopmentAccessCard/);
  assert.match(department, /role=\{departmentCode\}/);
});


test("legacy Reception, Housekeeping and Maintenance workspaces expose the same entitled development bridge", () => {
  for (const [path, role] of [
    ["../../components/staff/pages/HousekeepingPageContent.tsx", "housekeeping"],
    ["../../components/staff/pages/MaintenancePageContent.tsx", "maintenance"],
    ["../../components/staff/pages/ReceptionPageContent.tsx", "reception"],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /StaffDevelopmentAccessCard/);
    assert.match(
      source,
      new RegExp(`StaffDevelopmentAccessCard hotelSlug=\\{hotelSlug\\} role="${role}"`),
    );
  }
});
