import { NextRequest, NextResponse } from "next/server";

type StaffPushRole = "manager" | "reception" | "housekeeping" | "maintenance";

const ROLE_LABELS: Record<StaffPushRole, { name: string; shortName: string; description: string }> = {
  manager: {
    name: "StayHub Manager",
    shortName: "Manager",
    description: "StayHub manager app for hotel operations.",
  },
  reception: {
    name: "StayHub Reception",
    shortName: "Reception",
    description: "StayHub reception app for hotel requests.",
  },
  housekeeping: {
    name: "StayHub Housekeeping",
    shortName: "Housekeeping",
    description: "StayHub housekeeping app for room requests.",
  },
  maintenance: {
    name: "StayHub Maintenance",
    shortName: "Maintenance",
    description: "StayHub maintenance app for technical requests.",
  },
};

function cleanSlug(value: string | null) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function parseRole(value: string | null): StaffPushRole | null {
  if (
    value === "manager" ||
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance"
  ) {
    return value;
  }
  return null;
}

export function GET(request: NextRequest) {
  const hotelSlug = cleanSlug(request.nextUrl.searchParams.get("hotelSlug"));
  const role = parseRole(request.nextUrl.searchParams.get("role"));

  if (!hotelSlug || !role) {
    return NextResponse.json({ ok: false, error: "Invalid staff PWA manifest parameters" }, { status: 400 });
  }

  const startPath = `/staff/${hotelSlug}/${role}`;
  const labels = ROLE_LABELS[role];

  return NextResponse.json(
    {
      name: labels.name,
      short_name: labels.shortName,
      description: labels.description,
      id: startPath,
      start_url: `${startPath}?source=pwa`,
      scope: `/staff/${hotelSlug}/`,
      display: "standalone",
      orientation: "portrait",
      background_color: "#0B0F12",
      theme_color: "#0B0F12",
      icons: [
        {
          src: "/icons/manager-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/manager-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-192-maskable.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icons/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
