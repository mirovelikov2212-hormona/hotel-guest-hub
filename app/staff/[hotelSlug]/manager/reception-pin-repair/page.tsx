import ReceptionPinRepair from "@/components/staff/ReceptionPinRepair";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function ReceptionPinRepairPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  await requireStaffAccess(hotelSlug, "manager");

  return <ReceptionPinRepair hotelSlug={hotelSlug} />;
}
