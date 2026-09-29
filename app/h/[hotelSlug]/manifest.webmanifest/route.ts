import { NextResponse } from "next/server";

import { getHotelConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

function cleanSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function safeColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hotelSlug: string }> },
) {
  const { hotelSlug: rawHotelSlug } = await params;
  const hotelSlug = cleanSlug(rawHotelSlug);

  if (!hotelSlug) {
    return NextResponse.json({ ok: false, error: "Invalid hotel slug" }, { status: 400 });
  }

  const config = await getHotelConfig(hotelSlug);
  if (!config) {
    return NextResponse.json({ ok: false, error: "Hotel not found" }, { status: 404 });
  }

  const hubPath = `/h/${hotelSlug}`;
  const hotelName = String(config.hotelName || "GOSTAYA").trim() || "GOSTAYA";
  const themeColor = safeColor(
    config.theme?.primary || config.theme?.accent,
    "#43B5A1",
  );
  const backgroundColor = safeColor(config.theme?.background, "#F5F5F5");

  return NextResponse.json(
    {
      id: hubPath,
      name: `${hotelName} · GOSTAYA`,
      short_name: hotelName.slice(0, 28),
      description: `${hotelName} digital guest hub`,
      start_url: `${hubPath}?source=pwa`,
      scope: hubPath,
      display: "standalone",
      orientation: "portrait",
      background_color: backgroundColor,
      theme_color: themeColor,
      icons: [
        {
          src: "/icons/icon-192.png?v=3",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-192-maskable.png?v=3",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icons/icon-512.png?v=3",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-512-maskable.png?v=3",
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
