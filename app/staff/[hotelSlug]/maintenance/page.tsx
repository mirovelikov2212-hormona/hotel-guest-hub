import { requireStaffAccess } from "@/lib/staff-auth/guards";
import MaintenancePageContent from "@/components/staff/pages/MaintenancePageContent";

export default async function StaffMaintenanceScopedPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  await requireStaffAccess(hotelSlug, "maintenance");

  return <MaintenancePageContent />;
}