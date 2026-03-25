import type { ReactNode } from "react";
import { StaffUiProvider } from "@/components/staff/StaffUiProvider";
import StaffShellClient from "@/components/staff/StaffShellClient";

export const metadata = {
  title: "GuestHub Staff",
  description: "Staff Hub for hotel departments",
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffUiProvider>
      <StaffShellClient>{children}</StaffShellClient>
    </StaffUiProvider>
  );
}
