import type { Metadata } from "next";
import MarketingPage from "@/components/marketing/MarketingPage";

const description =
  "GOSTAYA е дигитална платформа за автоматизация на хотелските процеси – от заявките на гостите и работата на хотелските отдели до отчетите и анализа за мениджмънта.";

export const metadata: Metadata = {
  title: "GOSTAYA – Дигиталното сърце на всеки хотел",
  description,
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
    title: "GOSTAYA – Дигиталното сърце на всеки хотел",
    description,
    url: "https://gostaya.com/bg",
    locale: "bg_BG",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOSTAYA – Дигиталното сърце на всеки хотел",
    description,
  },
  keywords: [
    "дигитална платформа за хотели",
    "автоматизация на хотелски процеси",
    "AI асистент за хотел",
    "дигитален хотелски консиерж",
    "портал за хотелски гости",
    "управление на хотелски заявки",
    "хотелски операции",
    "мениджърски панел за хотел",
    "обучение на хотелски персонал",
    "хотелски приходи и ROI",
    "PMS интеграция",
  ],
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://gostaya.com/#organization",
      name: "GOSTAYA",
      url: "https://gostaya.com/",
    },
    {
      "@type": "WebSite",
      "@id": "https://gostaya.com/#website",
      url: "https://gostaya.com/",
      name: "GOSTAYA",
      inLanguage: "bg",
      publisher: { "@id": "https://gostaya.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://gostaya.com/#software",
      name: "GOSTAYA",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://gostaya.com/bg",
      description,
      featureList: [
        "Брандиран портал за хотелски гости",
        "AI асистент за хотелски услуги и информация",
        "Автоматично насочване на заявки към хотелските отдели",
        "Оперативни панели за Рецепция, Хаускипинг и Поддръжка",
        "Мениджърски отчети и оперативен анализ",
        "Обучение и развитие на персонала",
        "Проследяване на приходи и възвръщаемост",
        "Интеграционен слой за хотелски системи",
      ],
      publisher: { "@id": "https://gostaya.com/#organization" },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Какво е GOSTAYA?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "GOSTAYA е дигитална платформа за автоматизация на хотелските процеси, която свързва портала за госта, хотелските отдели и мениджърския панел.",
          },
        },
        {
          "@type": "Question",
          name: "Трябва ли гостът да инсталира приложение?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Не. Порталът за госта работи директно в браузъра и по желание може да бъде добавен като PWA пряк път.",
          },
        },
        {
          "@type": "Question",
          name: "Може ли заявка да стигне директно до отдел?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Да. Заявките се насочват автоматично според правилата и работното време на конкретния хотел.",
          },
        },
      ],
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <MarketingPage lang="bg" />
    </>
  );
}
