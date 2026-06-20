import type { ReactNode } from "react";
import { StaffStoreProvider } from "@/components/staff/store/StaffStoreProvider";
import { StaffUiProvider } from "@/components/staff/StaffUiProvider";
import StaffShellClient from "@/components/staff/StaffShellClient";
import StaffPwaManifestLink from "@/components/staff/StaffPwaManifestLink";

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