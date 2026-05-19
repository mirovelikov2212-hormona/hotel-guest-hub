import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";
import { getHotelIdBySlug } from "@/lib/hotels/getHotelIdBySlug";

export default async function StaffHotelScopedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  const hotelId = await getHotelIdBySlug(hotelSlug);

  if (!hotelId) {
    notFound();
  }

  return (
    <StaffStoreProvider hotelSlug={hotelSlug} hotelId={hotelId}>
      {children}
    </StaffStoreProvider>
  );
}