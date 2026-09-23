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


test("Manager attention bridge requires personal Hotel Manager identity and returns aggregates only", () => {
  const server = readFileSync(
    new URL(
      "../../lib/server/staff-development-attention.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const route = readFileSync(
    new URL(
      "../../app/api/staff/development/attention/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const card = readFileSync(
    new URL(
      "../../components/staff/StaffDevelopmentAccessCard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(server, /getCurrentStaffDevelopmentIdentity\(hotelSlug\)/);
  assert.match(server, /staffUserRole !== "hotel_manager"/);
  assert.match(server, /getStaffDevelopmentManagerBrief\(hotelSlug\)/);
  assert.doesNotMatch(server, /staffName/);
  assert.doesNotMatch(server, /attentionItems:/);
  assert.doesNotMatch(route, /hotelId/);
  assert.doesNotMatch(route, /staffUserId/);
  assert.match(card, /attentionResponse\.status === 401/);
  assert.match(card, /pendingHumanReviews/);
  assert.match(card, /overdueTrainingAssignments/);
  assert.match(card, /hrRuleFindings/);
});
