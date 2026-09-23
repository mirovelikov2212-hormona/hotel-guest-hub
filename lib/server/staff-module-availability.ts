import "server-only";

import {
  getHotelProductModuleEntitlement,
} from "@/lib/server/product-module-entitlements";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import {
  resolveStaffRuntimeRoleForHotelId,
} from "@/lib/server/staff-runtime-role";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

export async function getStaffModuleAvailability(input: {
  hotelSlug: unknown;
  role: unknown;
}) {
  const hotelSlug = String(input.hotelSlug || "").trim().toLowerCase();
  const role = normalizeStaffRoleCode(input.role);
  if (!hotelSlug || !role) {
    throw new Error("STAFF_MODULE_CONTEXT_INVALID");
  }

  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session) {
    throw new Error("STAFF_MODULE_SESSION_REQUIRED");
  }

  const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
  if (
    !hotel?.id
    || String(hotel.id) !== String(session.hotel_id)
    || session.role !== role
  ) {
    throw new Error("STAFF_MODULE_SCOPE_MISMATCH");
  }

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(
    String(hotel.id),
    role,
  );
  if (!runtimeRole) {
    throw new Error("STAFF_MODULE_ROLE_INACTIVE");
  }

  const entitlement = await getHotelProductModuleEntitlement(
    String(hotel.id),
  );

  return {
    hotelSlug: String(hotel.slug),
    role,
    runtimeRole: {
      kind: runtimeRole.kind,
      departmentCode: runtimeRole.departmentCode,
      departmentName: runtimeRole.departmentName,
    },
    modules: {
      staffOperations: entitlement.moduleAccess.staff_operations,
      staffDevelopment: entitlement.moduleAccess.staff_development,
      managerIntelligence:
        role === "manager"
        && entitlement.moduleAccess.manager_intelligence,
      revenueIntelligence:
        role === "manager"
        && entitlement.moduleAccess.revenue_intelligence,
      integrationLayer:
        role === "manager"
        && entitlement.moduleAccess.integration_layer,
    },
    entitlementSource: entitlement.source,
  };
}
