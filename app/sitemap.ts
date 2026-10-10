import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://gostaya.com/bg", lastModified: now, changeFrequency: "weekly", priority: 1 },
  ];
}
