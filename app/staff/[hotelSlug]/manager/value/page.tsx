import GostayaValueDashboard from "@/components/staff/value/GostayaValueDashboard";
import ManagerModuleBackLink from "@/components/staff/ManagerModuleBackLink";
import {
  requireHotelPaidProductModuleAccess,
} from "@/lib/server/product-module-entitlements";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function ManagerValuePage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  const access = await requireStaffAccess(hotelSlug, "manager");

  await requireHotelPaidProductModuleAccess(
    String(access.hotelId),
    "manager_intelligence",
  );
  await requireHotelPaidProductModuleAccess(
    String(access.hotelId),
    "revenue_intelligence",
  );

  return (
    <>
      <ManagerModuleBackLink hotelSlug={hotelSlug} />
      <GostayaValueDashboard hotelSlug={hotelSlug} />
    </>
  );
}
