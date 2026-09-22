import StaffDevelopmentPageContent from "@/components/staff/pages/StaffDevelopmentPageContent";
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

  await requireStaffAccess(hotelSlug, role);

  return (
    <StaffDevelopmentPageContent
      hotelSlug={hotelSlug}
      operationalRole={role}
    />
  );
}
