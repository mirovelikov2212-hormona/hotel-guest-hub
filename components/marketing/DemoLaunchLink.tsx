"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

type DemoLaunchLinkProps = {
  children: ReactNode;
  className?: string;
};

function resolveLang(pathname: string | null) {
  const segment = String(pathname || "").split("/").filter(Boolean)[0];
  return segment === "de" || segment === "en" ? segment : "bg";
}

export default function DemoLaunchLink({
  children,
  className,
}: DemoLaunchLinkProps) {
  const pathname = usePathname();
  const lang = resolveLang(pathname);
  const href = `/demo?lang=${lang}`;

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
