"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type StaffRole = "manager" | "reception" | "housekeeping" | "maintenance";

const STAFF_ROUTE_PATTERN = /^\/staff\/([^/?#]+)\/(manager|reception|housekeeping|maintenance)(?:\/)?$/;

function buildStaffManifestHref(pathname: string) {
  const match = pathname.match(STAFF_ROUTE_PATTERN);
  if (!match) return null;

  const hotelSlug = match[1];
  const role = match[2] as StaffRole;
  const params = new URLSearchParams({ hotelSlug, role });
  return `/api/staff/pwa/manifest?${params.toString()}`;
}

function setSingleManifestLink(href: string) {
  const existingLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'));
  const [firstLink, ...extraLinks] = existingLinks;
  extraLinks.forEach((link) => link.remove());

  const manifestLink = firstLink || document.createElement("link");
  manifestLink.rel = "manifest";
  manifestLink.href = href;

  if (!firstLink) {
    document.head.appendChild(manifestLink);
  }
}

export default function StaffPwaManifestLink() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const staffManifestHref = buildStaffManifestHref(pathname || "");
    if (!staffManifestHref) return;

    setSingleManifestLink(staffManifestHref);
  }, [pathname]);

  return null;
}
