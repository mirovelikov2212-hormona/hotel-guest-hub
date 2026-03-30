import { requireStaffAccess } from "@/lib/staff-auth/guards";
import HousekeepingPageContent from "@/components/staff/pages/HousekeepingPageContent";

export default async function StaffHousekeepingScopedPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  await requireStaffAccess(hotelSlug, "housekeeping");

  return <HousekeepingPageContent />;
}