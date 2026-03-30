
import { requireStaffAccess } from "@/lib/staff-auth/guards";
import ManagerPageContent from "@/components/staff/pages/ManagerPageContent";

export default async function StaffManagerScopedPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  await requireStaffAccess(hotelSlug, "manager");

  return <ManagerPageContent />;
}