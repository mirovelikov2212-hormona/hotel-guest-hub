import type { ReactNode } from "react";

import StaffPwaManifestLink from "@/components/staff/StaffPwaManifestLink";
import StaffShellClient from "@/components/staff/StaffShellClient";
import { StaffUiProvider } from "@/components/staff/StaffUiProvider";
import "./staff-theme.css";
import "./staff-theme-semantic.css";

export const metadata = {
  title: "GOSTAYA Staff",
  description: "GOSTAYA operational panels for hotel teams",
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StaffPwaManifestLink />
      <StaffUiProvider>
        <StaffShellClient>{children}</StaffShellClient>
      </StaffUiProvider>
    </>
  );
}
