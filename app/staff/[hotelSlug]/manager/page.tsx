import GuestTimelineProvider from "@/components/staff/guest-timeline/GuestTimelineProvider";
import ManagerPageContent from "@/components/staff/pages/ManagerPageContent";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function StaffManagerScopedPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  await requireStaffAccess(hotelSlug, "manager");

  return (
    <GuestTimelineProvider hotelSlug={hotelSlug} role="manager">
      <ManagerPageContent />
    </GuestTimelineProvider>
  );
}
