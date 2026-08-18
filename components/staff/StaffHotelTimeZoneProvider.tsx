"use client";

import { createContext, useContext, type ReactNode } from "react";

const StaffHotelTimeZoneContext = createContext<string | undefined>(undefined);

export default function StaffHotelTimeZoneProvider({
  children,
  timeZone,
}: {
  children: ReactNode;
  timeZone?: string | null;
}) {
  const normalizedTimeZone = String(timeZone ?? "").trim() || undefined;

  return (
    <StaffHotelTimeZoneContext.Provider value={normalizedTimeZone}>
      {children}
    </StaffHotelTimeZoneContext.Provider>
  );
}

export function useStaffHotelTimeZone() {
  return useContext(StaffHotelTimeZoneContext);
}
