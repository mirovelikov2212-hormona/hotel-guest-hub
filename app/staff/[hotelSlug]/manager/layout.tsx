import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}): Promise<Metadata> {
  const { hotelSlug } = await params;
  const encodedSlug = encodeURIComponent(hotelSlug);

  return {
    title: "StayHub Manager",
    description: "StayHub Manager operations and request notifications",
    applicationName: "StayHub Manager",
    manifest: `/manager-pwa/${encodedSlug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "StayHub Manager",
    },
    icons: {
      icon: [
        { url: "/icons/manager-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/manager-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/manager-180.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#171717",
  colorScheme: "dark",
};

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return children;
}
