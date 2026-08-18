import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import StaffHotelTimeZoneProvider from "@/components/staff/StaffHotelTimeZoneProvider";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";
import { getHotelByAnySlug } from "@/lib/hotels/getHotelByAnySlug";

export default async function StaffHotelScopedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  let hotel: Awaited<ReturnType<typeof getHotelByAnySlug>>;
  try {
    hotel = await getHotelByAnySlug(hotelSlug);
  } catch {
    notFound();
  }

  return (
    <StaffHotelTimeZoneProvider timeZone={hotel.timezone}>
      <StaffStoreProvider hotelSlug={hotelSlug} hotelId={hotel.id}>
        {children}
      </StaffStoreProvider>
    </StaffHotelTimeZoneProvider>
  );
}
