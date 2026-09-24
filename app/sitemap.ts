import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://gostaya.com/en", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://gostaya.com/de", lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: "https://gostaya.com/bg", lastModified: now, changeFrequency: "weekly", priority: 0.9 },
  ];
}
