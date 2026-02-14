import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hotel Guest Hub",
    short_name: "Guest Hub",
    description: "Hotel guest services in one place.",
    start_url: "/h/demo",
    display: "standalone",
    background_color: "#0b0f17",
    theme_color: "#9B86BD",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
