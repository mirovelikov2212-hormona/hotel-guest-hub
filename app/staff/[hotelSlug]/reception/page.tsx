import ReceptionPageContent from "@/components/staff/pages/ReceptionPageContent";
import { getHotelByAnySlug } from "@/lib/hotels/getHotelByAnySlug";
import { requireStaffAccess } from "@/lib/staff-auth/guards";

export default async function StaffReceptionScopedPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  await requireStaffAccess(hotelSlug, "reception");

  const hotel = await getHotelByAnySlug(hotelSlug);
  const hotelTimeZone = String(hotel.timezone || "").trim();

  if (!hotelTimeZone) {
    throw new Error(`Missing hotel timezone for staff reception: ${hotelSlug}`);
  }

  return <ReceptionPageContent hotelTimeZone={hotelTimeZone} />;
}
