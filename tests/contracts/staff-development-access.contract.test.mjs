import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeStaffDevelopmentAction,
  sharedOperationalPinCanAuthorizeStaffDevelopment,
} from "../../lib/staff-development/staff-development-access-model.mjs";

const HOTEL_ID = "hotel-a";
const STAFF_ID = "staff-user-a";

test("Shared operational PIN is never individual Staff Development identity", () => {
  assert.equal(sharedOperationalPinCanAuthorizeStaffDevelopment(), false);

  const result = authorizeStaffDevelopmentAction({
    action: "submit_assessment",
    identityMode: "shared_department_pin",
    actorRole: "staff",
    staffUserId: null,
    actorHotelId: HOTEL_ID,
    targetHotelId: HOTEL_ID,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.code,
    "STAFF_DEVELOPMENT_INDIVIDUAL_IDENTITY_REQUIRED",
  );
});

test("Individual learner actions require a verified staff_user identity in the same hotel", () => {
  const allowed = authorizeStaffDevelopmentAction({
    action: "submit_assessment",
    identityMode: "individual_verified",
    actorRole: "staff",
    staffUserId: STAFF_ID,
    actorHotelId: HOTEL_ID,
    targetHotelId: HOTEL_ID,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.authority, "individual_staff_user");

  const crossHotel = authorizeStaffDevelopmentAction({
    action: "submit_assessment",
    identityMode: "individual_verified",
    actorRole: "staff",
    staffUserId: STAFF_ID,
    actorHotelId: HOTEL_ID,
    targetHotelId: "hotel-b",
  });
  assert.equal(crossHotel.ok, false);
  assert.equal(crossHotel.code, "STAFF_DEVELOPMENT_TENANT_MISMATCH");
});

test("Manager development actions require identified manager identity, not only a manager role cookie", () => {
  const noIdentity = authorizeStaffDevelopmentAction({
    action: "review_assessment",
    identityMode: "shared_department_pin",
    actorRole: "hotel_manager",
    staffUserId: null,
    actorHotelId: HOTEL_ID,
    targetHotelId: HOTEL_ID,
  });
  assert.equal(noIdentity.ok, false);
  assert.equal(
    noIdentity.code,
    "STAFF_DEVELOPMENT_MANAGER_IDENTITY_REQUIRED",
  );

  const allowed = authorizeStaffDevelopmentAction({
    action: "review_assessment",
    identityMode: "individual_verified",
    actorRole: "hotel_manager",
    staffUserId: STAFF_ID,
    actorHotelId: HOTEL_ID,
    targetHotelId: HOTEL_ID,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.authority, "identified_manager");
});

test("Ordinary staff cannot author HR rules even with verified individual identity", () => {
  const result = authorizeStaffDevelopmentAction({
    action: "author_hr_rules",
    identityMode: "individual_verified",
    actorRole: "staff",
    staffUserId: STAFF_ID,
    actorHotelId: HOTEL_ID,
    targetHotelId: HOTEL_ID,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.code,
    "STAFF_DEVELOPMENT_MANAGER_IDENTITY_REQUIRED",
  );
});
