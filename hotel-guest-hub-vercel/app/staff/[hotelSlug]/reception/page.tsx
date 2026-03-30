import { requireStaffAccess } from "@/lib/staff-auth/guards";
import ReceptionPageContent from "@/components/staff/pages/ReceptionPageContent";

export default async function StaffReceptionScopedPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  await requireStaffAccess(hotelSlug, "reception");

  return <ReceptionPageContent />;
}