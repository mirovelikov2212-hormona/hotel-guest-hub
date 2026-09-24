import type { Metadata } from "next";
import MarketingPage from "@/components/marketing/MarketingPage";

export const metadata: Metadata = {
  title: "GOSTAYA — AI Guest Experience & Hotel Operations Platform",
  description: "GOSTAYA connects the Guest Hub, AI concierge, hotel operations, Manager Intelligence, Staff Development, Revenue/ROI and PMS-ready integrations.",
  alternates: {
    canonical: "https://gostaya.com/en",
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
    title: "GOSTAYA — AI Guest Experience & Hotel Operations Platform",
    description: "GOSTAYA connects the Guest Hub, AI concierge, hotel operations, Manager Intelligence, Staff Development, Revenue/ROI and PMS-ready integrations.",
    url: "https://gostaya.com/en",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOSTAYA — AI Guest Experience & Hotel Operations Platform",
    description: "GOSTAYA connects the Guest Hub, AI concierge, hotel operations, Manager Intelligence, Staff Development, Revenue/ROI and PMS-ready integrations.",
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
  return <MarketingPage lang="en" />;
}
