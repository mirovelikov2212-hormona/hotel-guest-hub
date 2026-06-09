import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hotelSlug: string }> },
) {
  const { hotelSlug: rawHotelSlug } = await params;
  const hotelSlug = encodeURIComponent(String(rawHotelSlug || "").trim().toLowerCase());
  const managerPath = `/staff/${hotelSlug}/manager`;

  return NextResponse.json(
    {
      id: managerPath,
      name: "StayHub Manager",
      short_name: "Manager",
      description: "StayHub manager operations and hotel request notifications",
      start_url: `${managerPath}?source=manager-pwa`,
      scope: `/staff/${hotelSlug}/`,
      display: "standalone",
      orientation: "portrait",
      background_color: "#0a0a0a",
      theme_color: "#171717",
      icons: [
        {
          src: "/icons/manager-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/manager-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icons/manager-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/manager-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
