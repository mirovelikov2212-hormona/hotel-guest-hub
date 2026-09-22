export const STAFF_DEVELOPMENT_ACCESS_SCHEMA_VERSION =
  "staff-development-access-v1";

const INDIVIDUAL_ACTIONS = new Set([
  "start_training",
  "complete_training",
  "start_assessment",
  "submit_assessment",
  "view_own_results",
]);

const MANAGER_ACTIONS = new Set([
  "author_standard",
  "publish_standard",
  "assign_training",
  "author_assessment",
  "review_assessment",
  "author_hr_rules",
  "view_staff_development",
  "run_hr_evaluation",
]);

const MANAGER_ROLES = new Set(["department_manager", "hotel_manager"]);

function clean(value) {
  return String(value ?? "").trim();
}

export function authorizeStaffDevelopmentAction(input) {
  const action = clean(input?.action).toLowerCase();
  const identityMode = clean(input?.identityMode).toLowerCase();
  const actorRole = clean(input?.actorRole).toLowerCase();
  const staffUserId = clean(input?.staffUserId).toLowerCase();
  const actorHotelId = clean(input?.actorHotelId).toLowerCase();
  const targetHotelId = clean(input?.targetHotelId).toLowerCase();

  if (!action || (!INDIVIDUAL_ACTIONS.has(action) && !MANAGER_ACTIONS.has(action))) {
    return {
      ok: false,
      code: "STAFF_DEVELOPMENT_ACTION_INVALID",
    };
  }

  if (!actorHotelId || !targetHotelId || actorHotelId !== targetHotelId) {
    return {
      ok: false,
      code: "STAFF_DEVELOPMENT_TENANT_MISMATCH",
    };
  }

  if (INDIVIDUAL_ACTIONS.has(action)) {
    if (identityMode !== "individual_verified" || !staffUserId) {
      return {
        ok: false,
        code: "STAFF_DEVELOPMENT_INDIVIDUAL_IDENTITY_REQUIRED",
      };
    }

    return {
      ok: true,
      action,
      authority: "individual_staff_user",
      staffUserId,
    };
  }

  if (
    identityMode !== "individual_verified"
    || !staffUserId
    || !MANAGER_ROLES.has(actorRole)
  ) {
    return {
      ok: false,
      code: "STAFF_DEVELOPMENT_MANAGER_IDENTITY_REQUIRED",
    };
  }

  return {
    ok: true,
    action,
    authority: "identified_manager",
    staffUserId,
    actorRole,
  };
}

export function sharedOperationalPinCanAuthorizeStaffDevelopment() {
  return false;
}
