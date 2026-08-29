import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import StaffHotelShell from "@/components/staff/StaffHotelShell";
import StaffHotelTimeZoneProvider from "@/components/staff/StaffHotelTimeZoneProvider";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";
import { getHotelByAnySlug } from "@/lib/hotels/getHotelByAnySlug";
import { resolveStaffHotelBrand } from "@/lib/server/staff-hotel-brand";

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

  const brand = await resolveStaffHotelBrand({
    hotelId: hotel.id,
    hotelSlug: hotel.slug,
    hotelName: hotel.name,
  });

  return (
    <StaffHotelTimeZoneProvider timeZone={hotel.timezone}>
      <StaffStoreProvider hotelSlug={hotelSlug} hotelId={hotel.id}>
        <StaffHotelShell hotelSlug={hotelSlug} brand={brand}>
          {children}
        </StaffHotelShell>
      </StaffStoreProvider>
    </StaffHotelTimeZoneProvider>
  );
}
