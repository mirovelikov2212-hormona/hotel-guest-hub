import ManagerModuleBackLink from "@/components/staff/ManagerModuleBackLink";
import StaffDevelopmentPageContent from "@/components/staff/pages/StaffDevelopmentPageContent";
import { requireHotelProductModuleAccess } from "@/lib/server/product-module-entitlements";
import { requireStaffAccess } from "@/lib/staff-auth/guards";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

export default async function StaffDevelopmentRoutePage({
  hotelSlug,
  operationalRole,
}: {
  hotelSlug: string;
  operationalRole: string;
}) {
  const role = normalizeStaffRoleCode(operationalRole);
  if (!role) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_ROLE_INVALID");
  }

  const access = await requireStaffAccess(hotelSlug, role);
  await requireHotelProductModuleAccess(
    String(access.hotelId),
    "staff_development",
  );

  return (
    <>
      {role === "manager" ? <ManagerModuleBackLink hotelSlug={hotelSlug} /> : null}
      <StaffDevelopmentPageContent
        hotelSlug={hotelSlug}
        operationalRole={role}
      />
    </>
  );
}
