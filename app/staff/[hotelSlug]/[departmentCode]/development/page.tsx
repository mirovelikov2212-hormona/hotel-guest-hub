import { notFound } from "next/navigation";

import StaffDevelopmentRoutePage from "@/components/staff/pages/StaffDevelopmentRoutePage";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

const LEGACY_STATIC_ROLES = new Set([
  "reception",
  "housekeeping",
  "maintenance",
  "manager",
]);

export default async function GenericStaffDevelopmentPage({
  params,
}: {
  params: Promise<{ hotelSlug: string; departmentCode: string }>;
}) {
  const { hotelSlug, departmentCode } = await params;
  const role = normalizeStaffRoleCode(departmentCode);

  if (!role || LEGACY_STATIC_ROLES.has(role)) {
    notFound();
  }

  return (
    <StaffDevelopmentRoutePage
      hotelSlug={hotelSlug}
      operationalRole={role}
    />
  );
}
