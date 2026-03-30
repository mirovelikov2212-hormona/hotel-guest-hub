import type { ReactNode } from "react";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";

export default async function StaffHotelScopedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;

  return <StaffStoreProvider hotelSlug={hotelSlug}>{children}</StaffStoreProvider>;
}
