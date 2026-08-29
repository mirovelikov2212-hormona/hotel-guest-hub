import type { ReactNode } from "react";

import StaffPwaManifestLink from "@/components/staff/StaffPwaManifestLink";
import StaffShellClient from "@/components/staff/StaffShellClient";
import { StaffUiProvider } from "@/components/staff/StaffUiProvider";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";

import "./staff-theme.css";
import "./staff-theme-semantic.css";

export const metadata = {
  title: "GuestHub Staff",
  description: "Staff Hub for hotel departments",
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StaffPwaManifestLink />
      <StaffUiProvider>
        <StaffStoreProvider>
          <StaffShellClient>{children}</StaffShellClient>
        </StaffStoreProvider>
      </StaffUiProvider>
    </>
  );
}
