import { notFound } from "next/navigation";
import GenericDepartmentPageContent from "@/components/staff/pages/GenericDepartmentPageContent";
import { requireStaffAccess } from "@/lib/staff-auth/guards";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

const LEGACY_STATIC_ROLES = new Set([
  "reception",
  "housekeeping",
  "maintenance",
  "manager",
]);

export default async function GenericStaffDepartmentPage({
  params,
}: {
  params: Promise<{ hotelSlug: string; departmentCode: string }>;
}) {
  const { hotelSlug, departmentCode } = await params;
  const role = normalizeStaffRoleCode(departmentCode);

  if (!role || LEGACY_STATIC_ROLES.has(role)) {
    notFound();
  }

  const access = await requireStaffAccess(hotelSlug, role);
  if (access.runtimeRole.kind !== "department") {
    notFound();
  }

  return (
    <GenericDepartmentPageContent
      hotelSlug={hotelSlug}
      departmentCode={role}
      departmentName={access.runtimeRole.departmentName || role}
    />
  );
}
