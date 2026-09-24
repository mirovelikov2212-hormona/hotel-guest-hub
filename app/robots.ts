import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/staff/", "/control-plane/", "/hotel-factory/", "/design-studio/"] },
      { userAgent: "OAI-SearchBot", allow: ["/", "/en", "/de", "/bg"] },
      { userAgent: "ChatGPT-User", allow: ["/", "/en", "/de", "/bg"] },
      { userAgent: "ClaudeBot", allow: ["/", "/en", "/de", "/bg"] },
      { userAgent: "Googlebot", allow: ["/", "/en", "/de", "/bg"] },
    ],
    sitemap: "https://gostaya.com/sitemap.xml",
    host: "https://gostaya.com",
  };
}
