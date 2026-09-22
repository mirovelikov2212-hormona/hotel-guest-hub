import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStaffTrainingAssignment,
  deriveStaffTrainingPlan,
  normalizeHotelStaffStandard,
} from "../../lib/staff-development/hotel-standard-model.mjs";

function standard(status = "published") {
  return {
    standardKey: "housekeeping-room-entry",
    revisionNo: 3,
    status,
    titleByLang: {
      bg: "Стандарт за влизане в стая",
      en: "Guest room entry standard",
    },
    standardScope: "department",
    departmentCodes: ["housekeeping"],
    roleCodes: ["staff", "department_manager"],
    effectiveFrom: "2026-10-01",
    trainingRequired: true,
    assessmentRequired: true,
    minimumPassScore: 85,
    blocks: [
      {
        id: "announce-entry",
        titleByLang: { bg: "Предупреждение", en: "Announce entry" },
        bodyByLang: {
          bg: "Почукайте и се представете преди влизане.",
          en: "Knock and identify yourself before entering.",
        },
        severity: "critical",
        tags: ["guest_privacy"],
      },
      {
        id: "respect-dnd",
        titleByLang: { bg: "Не безпокойте", en: "Respect DND" },
        bodyByLang: {
          bg: "Не влизайте при активен знак Не безпокойте.",
          en: "Do not enter when Do Not Disturb is active.",
        },
        severity: "critical",
        tags: ["guest_privacy", "dnd"],
      },
    ],
  };
}

test("Staff standards are versioned, hotel-configurable content with exact immutable hashes", () => {
  const first = normalizeHotelStaffStandard(standard());
  const changedInput = standard();
  changedInput.blocks[0].bodyByLang.en = "Knock twice and identify yourself before entering.";
  const second = normalizeHotelStaffStandard(changedInput);

  assert.equal(first.schemaVersion, "hotel-staff-standard-v2");
  assert.equal(first.standardKey, "housekeeping-room-entry");
  assert.equal(first.revisionNo, 3);
  assert.equal(first.standardScope, "department");
  assert.deepEqual(first.departmentCodes, ["housekeeping"]);
  assert.equal(first.minimumPassScore, 85);
  assert.match(first.standardHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.standardHash, second.standardHash);
});

test("Training can only derive from a published standard and keeps exact source lineage", () => {
  assert.throws(
    () => deriveStaffTrainingPlan(standard("draft")),
    /STAFF_TRAINING_REQUIRES_PUBLISHED_STANDARD/,
  );

  const published = normalizeHotelStaffStandard(standard("published"));
  const plan = deriveStaffTrainingPlan(standard("published"));

  assert.equal(plan.sourceStandardKey, published.standardKey);
  assert.equal(plan.sourceStandardRevisionNo, published.revisionNo);
  assert.equal(plan.sourceStandardHash, published.standardHash);
  assert.equal(plan.schemaVersion, "staff-training-plan-v2");
  assert.equal(plan.standardScope, "department");
  assert.equal(plan.units.length, 2);
  assert.deepEqual(plan.units[0].sourceBlockIds, ["announce-entry"]);
  assert.match(plan.trainingPlanHash, /^[a-f0-9]{64}$/);
});

test("Training assignment belongs to an individual staff_user, never to a shared department PIN", () => {
  const plan = deriveStaffTrainingPlan(standard());
  const assignment = assertStaffTrainingAssignment({
    hotelId: "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670",
    staffUserId: "5b83d872-cb27-4e8d-8916-828f75d520b0",
    trainingPlanHash: plan.trainingPlanHash,
    standardHash: plan.sourceStandardHash,
  });

  assert.equal(
    assignment.staffUserId,
    "5b83d872-cb27-4e8d-8916-828f75d520b0",
  );
  assert.equal(
    assignment.hotelId,
    "3d74f8f8-2f19-4eed-8ac9-22f4d42f6670",
  );

  assert.throws(
    () => assertStaffTrainingAssignment({
      hotelId: assignment.hotelId,
      staffUserId: "housekeeping",
      trainingPlanHash: plan.trainingPlanHash,
      standardHash: plan.sourceStandardHash,
    }),
    /STAFF_TRAINING_STAFF_USER_ID_INVALID/,
  );
});

test("Scope is explicit: Hotel standards target the hotel, Department standards target concrete departments", () => {
  const departmentWithoutDepartment = standard();
  departmentWithoutDepartment.departmentCodes = [];
  assert.throws(
    () => normalizeHotelStaffStandard(departmentWithoutDepartment),
    /STAFF_STANDARD_DEPARTMENT_SCOPE_REQUIRED/,
  );

  const hotelWide = standard();
  hotelWide.standardKey = "hotel-general-standard";
  hotelWide.standardScope = "hotel";
  hotelWide.departmentCodes = [];
  const normalizedHotel = normalizeHotelStaffStandard(hotelWide);
  const hotelPlan = deriveStaffTrainingPlan(hotelWide);

  assert.equal(normalizedHotel.standardScope, "hotel");
  assert.deepEqual(normalizedHotel.departmentCodes, []);
  assert.equal(hotelPlan.standardScope, "hotel");
  assert.deepEqual(hotelPlan.departmentCodes, []);

  const invalidHotel = standard();
  invalidHotel.standardScope = "hotel";
  invalidHotel.departmentCodes = ["housekeeping"];
  assert.throws(
    () => normalizeHotelStaffStandard(invalidHotel),
    /STAFF_STANDARD_HOTEL_SCOPE_DEPARTMENTS_FORBIDDEN/,
  );

  const duplicateBlocks = standard();
  duplicateBlocks.blocks[1].id = duplicateBlocks.blocks[0].id;
  assert.throws(
    () => normalizeHotelStaffStandard(duplicateBlocks),
    /STAFF_STANDARD_BLOCK_ID_DUPLICATE/,
  );

  const invalidRange = standard();
  invalidRange.effectiveFrom = "2026-12-01";
  invalidRange.effectiveTo = "2026-10-01";
  assert.throws(
    () => normalizeHotelStaffStandard(invalidRange),
    /STAFF_STANDARD_EFFECTIVE_RANGE_INVALID/,
  );
});

test("Standards model contains no pilot-hotel or fixed-shift assumptions", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../../lib/staff-development/hotel-standard-model.mjs", import.meta.url),
      "utf8",
    ),
  );

  for (const forbidden of [
    "aquamarine",
    "sunny castle",
    "kranevo",
    "08:00",
    "17:00",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden), false);
  }
});
