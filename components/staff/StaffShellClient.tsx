"use client";

import type { ReactNode } from "react";

export default function StaffShellClient({
  children,
}: {
  children: ReactNode;
}) {
  // Hotel-scoped staff routes are themed by StaffHotelShell in
  // app/staff/[hotelSlug]/layout.tsx. Keep the root shell presentation-neutral
  // so legacy and future department routes inherit exactly one theme layer.
  return <>{children}</>;
}
