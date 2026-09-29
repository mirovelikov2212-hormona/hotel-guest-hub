"use client";

import type { MouseEvent, ReactNode } from "react";

type DemoLaunchLinkProps = {
  children: ReactNode;
  className?: string;
  hubUrl?: string;
  managerUrl?: string;
};

export default function DemoLaunchLink({
  children,
  className,
  hubUrl = "/h/demo",
  managerUrl = "/staff/demo/manager",
}: DemoLaunchLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    // One explicit user click opens the operational view in a second tab,
    // while the current tab enters the Guest Hub. If the browser blocks the
    // second tab, the fallback href still points to the Guest Hub.
    window.open(managerUrl, "_blank", "noopener,noreferrer");
    window.location.assign(hubUrl);
  };

  return (
    <a href={hubUrl} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
