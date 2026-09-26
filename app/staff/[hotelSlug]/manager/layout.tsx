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
    title: "GOSTAYA Manager",
    description: "GOSTAYA hotel operations, manager intelligence and request notifications",
    applicationName: "GOSTAYA Manager",
    manifest: `/manager-pwa/${encodedSlug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "GOSTAYA Manager",
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
  themeColor: "#f5faff",
  colorScheme: "light",
};

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return children;
}
