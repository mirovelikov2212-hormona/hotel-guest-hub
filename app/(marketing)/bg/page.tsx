import type { Metadata } from "next";
import MarketingPage from "@/components/marketing/MarketingPage";

export const metadata: Metadata = {
  title: "GOSTAYA — AI платформа за хотелски гости, операции и мениджмънт",
  description: "GOSTAYA свързва Guest Hub, AI concierge, хотелски отдели, Manager Intelligence, Staff Development, Revenue/ROI и PMS-ready интеграции.",
  alternates: {
    canonical: "https://gostaya.com/bg",
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
    title: "GOSTAYA — AI платформа за хотелски гости, операции и мениджмънт",
    description: "GOSTAYA свързва Guest Hub, AI concierge, хотелски отдели, Manager Intelligence, Staff Development, Revenue/ROI и PMS-ready интеграции.",
    url: "https://gostaya.com/bg",
    locale: "bg_BG",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOSTAYA — AI платформа за хотелски гости, операции и мениджмънт",
    description: "GOSTAYA свързва Guest Hub, AI concierge, хотелски отдели, Manager Intelligence, Staff Development, Revenue/ROI и PMS-ready интеграции.",
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
  return <MarketingPage lang="bg" />;
}
