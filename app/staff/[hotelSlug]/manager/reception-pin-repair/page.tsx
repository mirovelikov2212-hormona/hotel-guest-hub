import ReceptionPinRepair from "@/components/staff/ReceptionPinRepair";
import ManagerModuleBackLink from "@/components/staff/ManagerModuleBackLink";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function ReceptionPinRepairPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  await requireStaffAccess(hotelSlug, "manager");

  return (
    <>
      <ManagerModuleBackLink hotelSlug={hotelSlug} />
      <ReceptionPinRepair hotelSlug={hotelSlug} />
    </>
  );
}
