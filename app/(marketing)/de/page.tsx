import type { Metadata } from "next";
import MarketingPage from "@/components/marketing/MarketingPage";

export const metadata: Metadata = {
  title: "GOSTAYA — AI Guest Experience & Hotel Operations Plattform",
  description: "GOSTAYA verbindet Guest Hub, AI Concierge, Hotel Operations, Manager Intelligence, Staff Development, Revenue/ROI und PMS-ready Integrationen.",
  alternates: {
    canonical: "https://gostaya.com/de",
    languages: {
      "x-default": "https://gostaya.com/en",
      en: "https://gostaya.com/en",
      de: "https://gostaya.com/de",
      bg: "https://gostaya.com/bg",
    },
  },
  openGraph: {
    type: "website",
    siteName: "GOSTAYA",
    title: "GOSTAYA — AI Guest Experience & Hotel Operations Plattform",
    description: "GOSTAYA verbindet Guest Hub, AI Concierge, Hotel Operations, Manager Intelligence, Staff Development, Revenue/ROI und PMS-ready Integrationen.",
    url: "https://gostaya.com/de",
    locale: "de_DE",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOSTAYA — AI Guest Experience & Hotel Operations Plattform",
    description: "GOSTAYA verbindet Guest Hub, AI Concierge, Hotel Operations, Manager Intelligence, Staff Development, Revenue/ROI und PMS-ready Integrationen.",
  },
  keywords: [
    "hotel digital concierge",
    "AI concierge for hotels",
    "hotel guest experience platform",
    "hotel operations software",
    "guest request management",
    "hotel staff operations",
    "hotel manager intelligence",
    "hotel staff training software",
    "hotel revenue intelligence",
    "hotel PMS integration",
  ],
};

export default function Page() {
  return <MarketingPage lang="de" />;
}
