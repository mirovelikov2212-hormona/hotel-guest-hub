import RevenueDashboard from "@/components/staff/revenue/RevenueDashboard";
import {
  requireHotelProductModuleAccess,
} from "@/lib/server/product-module-entitlements";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function ManagerRevenuePage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  const access = await requireStaffAccess(hotelSlug, "manager");

  await requireHotelProductModuleAccess(
    String(access.hotelId),
    "revenue_intelligence",
  );

  return <RevenueDashboard hotelSlug={hotelSlug} />;
}
