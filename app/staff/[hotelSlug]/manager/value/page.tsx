import GostayaValueDashboard from "@/components/staff/value/GostayaValueDashboard";
import {
  requireHotelProductModuleAccess,
} from "@/lib/server/product-module-entitlements";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function ManagerValuePage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  const access = await requireStaffAccess(hotelSlug, "manager");

  await requireHotelProductModuleAccess(
    String(access.hotelId),
    "manager_intelligence",
  );
  await requireHotelProductModuleAccess(
    String(access.hotelId),
    "revenue_intelligence",
  );

  return <GostayaValueDashboard hotelSlug={hotelSlug} />;
}
