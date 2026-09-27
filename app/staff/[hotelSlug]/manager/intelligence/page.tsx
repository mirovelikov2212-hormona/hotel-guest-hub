import ManagerModuleBackLink from "@/components/staff/ManagerModuleBackLink";
import ManagerIntelligenceDashboard from "@/components/staff/manager-intelligence/ManagerIntelligenceDashboard";
import { requireHotelProductModuleAccess } from "@/lib/server/product-module-entitlements";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function ManagerIntelligencePage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  const access = await requireStaffAccess(hotelSlug, "manager");
  await requireHotelProductModuleAccess(String(access.hotelId), "manager_intelligence");

  return (
    <>
      <ManagerModuleBackLink hotelSlug={hotelSlug} />
      <ManagerIntelligenceDashboard hotelSlug={hotelSlug} />
    </>
  );
}
