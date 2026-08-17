import { notFound } from "next/navigation";
import StaffPinGate from "@/components/staff/StaffPinGate";
import { resolveStaffRuntimeRoleByHotelSlug } from "@/lib/server/staff-runtime-role";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

const LEGACY_STAFF_LOGIN_ROLES = new Set([
  "reception",
  "housekeeping",
  "maintenance",
  "manager",
]);

export default async function StaffPinPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelSlug: string }>;
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const { hotelSlug } = await params;
  const sp = await searchParams;

  const role = normalizeStaffRoleCode(sp.role);
  if (!role) {
    notFound();
  }

  const resolved = await resolveStaffRuntimeRoleByHotelSlug(hotelSlug, role);
  if (!resolved) {
    notFound();
  }

  const nextPath =
    typeof sp.next === "string" && sp.next.startsWith(`/staff/${hotelSlug}/`)
      ? sp.next
      : `/staff/${hotelSlug}/${role}`;

  return (
    <StaffPinGate
      hotelSlug={hotelSlug}
      role={role}
      roleDisplayName={resolved.runtimeRole.departmentName || undefined}
      nextPath={nextPath}
      loginEndpoint={
        LEGACY_STAFF_LOGIN_ROLES.has(role)
          ? "/api/staff/auth/login"
          : "/api/staff/auth/department-login"
      }
    />
  );
}
