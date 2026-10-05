"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Lang = "bg" | "en" | "de";

type BrandVariant = {
  key: "resort" | "luxury" | "business" | "boutique";
  label: string;
  description: string;
  hotelName: string;
  hero: string;
  accent: string;
  secondary: string;
  surface: string;
  text: string;
  muted: string;
  card: string;
  fontClass: string;
  quick: string[];
};

const COPY: Record<Lang, { choose: string; helper: string; preview: string; variants: BrandVariant[] }> = {
  bg: {
    choose: "Изберете тип хотел",
    helper: "Изберете тип хотел и вижте как би изглеждал вашият хъб.",
    preview: "Примерен изглед на портала за госта",
    variants: [
      {
        key: "resort",
        label: "Курортен",
        description: "Динамичен интерфейс с акцент върху активностите, плажа и забавленията.",
        hotelName: "Azure Bay Resort",
        hero: "Днес в хотела",
        accent: "#0ea5e9",
        secondary: "#14b8a6",
        surface: "#eefbff",
        text: "#0c4a6e",
        muted: "#4b6b7c",
        card: "#ffffff",
        fontClass: "font-sans",
        quick: ["Плаж", "Активности", "Барове"],
      },
      {
        key: "luxury",
        label: "Луксозен",
        description: "Минималистичен и изтънчен дизайн (Dark/Premium режим), излъчващ престиж и персонално внимание.",
        hotelName: "Maison Aurelia",
        hero: "Вашият престой",
        accent: "#c6ad7f",
        secondary: "#6d5a3f",
        surface: "#0b0c0e",
        text: "#f5f0e8",
        muted: "#bfb5a6",
        card: "#16181b",
        fontClass: "font-serif",
        quick: ["Concierge", "Fine Dining", "Spa"],
      },
      {
        key: "business",
        label: "Бизнес",
        description: "Корпоративен, строг и функционален стил, ориентиран към бързина, графици и бизнес услуги.",
        hotelName: "Central Executive",
        hero: "Бърз достъп",
        accent: "#2563eb",
        secondary: "#334155",
        surface: "#f7f9fc",
        text: "#172554",
        muted: "#64748b",
        card: "#ffffff",
        fontClass: "font-sans",
        quick: ["Meeting", "Transfer", "Late check-out"],
      },
      {
        key: "boutique",
        label: "Бутиков",
        description: "Арт визия с нестандартна типография и акцент върху уникалната история и чар на хотела.",
        hotelName: "Atelier 17",
        hero: "Историята на мястото",
        accent: "#8c5a44",
        secondary: "#526b5a",
        surface: "#f7f2ea",
        text: "#332824",
        muted: "#7b6a62",
        card: "#fffdf9",
        fontClass: "font-serif",
        quick: ["История", "Local Guide", "Закуска"],
      },
    ],
  },
  en: {
    choose: "Choose hotel type",
    helper: "Choose a hotel type and see how your Guest Hub could look.",
    preview: "Sample guest hub appearance",
    variants: [
      { key: "resort", label: "Resort", description: "A lively interface focused on activities, beach and entertainment.", hotelName: "Azure Bay Resort", hero: "Today at the hotel", accent: "#0ea5e9", secondary: "#14b8a6", surface: "#eefbff", text: "#0c4a6e", muted: "#4b6b7c", card: "#ffffff", fontClass: "font-sans", quick: ["Beach", "Activities", "Bars"] },
      { key: "luxury", label: "Luxury", description: "A refined dark premium look designed around prestige and personal attention.", hotelName: "Maison Aurelia", hero: "Your stay", accent: "#c6ad7f", secondary: "#6d5a3f", surface: "#0b0c0e", text: "#f5f0e8", muted: "#bfb5a6", card: "#16181b", fontClass: "font-serif", quick: ["Concierge", "Fine Dining", "Spa"] },
      { key: "business", label: "Business", description: "A strict, functional style built around speed, schedules and business services.", hotelName: "Central Executive", hero: "Quick access", accent: "#2563eb", secondary: "#334155", surface: "#f7f9fc", text: "#172554", muted: "#64748b", card: "#ffffff", fontClass: "font-sans", quick: ["Meeting", "Transfer", "Late check-out"] },
      { key: "boutique", label: "Boutique", description: "An art-led identity with distinctive typography and a strong sense of place.", hotelName: "Atelier 17", hero: "The story of the place", accent: "#8c5a44", secondary: "#526b5a", surface: "#f7f2ea", text: "#332824", muted: "#7b6a62", card: "#fffdf9", fontClass: "font-serif", quick: ["Story", "Local Guide", "Breakfast"] },
    ],
  },
  de: {
    choose: "Hoteltyp wählen",
    helper: "Wählen Sie einen Hoteltyp und sehen Sie, wie Ihr Guest Hub aussehen könnte.",
    preview: "Beispielansicht des Guest Hubs",
    variants: [
      { key: "resort", label: "Resort", description: "Lebendige Oberfläche mit Fokus auf Aktivitäten, Strand und Unterhaltung.", hotelName: "Azure Bay Resort", hero: "Heute im Hotel", accent: "#0ea5e9", secondary: "#14b8a6", surface: "#eefbff", text: "#0c4a6e", muted: "#4b6b7c", card: "#ffffff", fontClass: "font-sans", quick: ["Strand", "Aktivitäten", "Bars"] },
      { key: "luxury", label: "Luxus", description: "Minimalistisches Premium-Design mit persönlicher, hochwertiger Wirkung.", hotelName: "Maison Aurelia", hero: "Ihr Aufenthalt", accent: "#c6ad7f", secondary: "#6d5a3f", surface: "#0b0c0e", text: "#f5f0e8", muted: "#bfb5a6", card: "#16181b", fontClass: "font-serif", quick: ["Concierge", "Fine Dining", "Spa"] },
      { key: "business", label: "Business", description: "Strenger, funktionaler Stil mit Fokus auf Tempo, Termine und Business-Services.", hotelName: "Central Executive", hero: "Schnellzugriff", accent: "#2563eb", secondary: "#334155", surface: "#f7f9fc", text: "#172554", muted: "#64748b", card: "#ffffff", fontClass: "font-sans", quick: ["Meeting", "Transfer", "Late Check-out"] },
      { key: "boutique", label: "Boutique", description: "Künstlerischer Look mit charakteristischer Typografie und individueller Hotelgeschichte.", hotelName: "Atelier 17", hero: "Die Geschichte des Ortes", accent: "#8c5a44", secondary: "#526b5a", surface: "#f7f2ea", text: "#332824", muted: "#7b6a62", card: "#fffdf9", fontClass: "font-serif", quick: ["Story", "Local Guide", "Frühstück"] },
    ],
  },
};

const HOTEL_IMAGES: Record<BrandVariant["key"], string> = {
  resort: "/marketing/hotel-hubs/resort-hq.webp",
  luxury: "/marketing/hotel-hubs/luxury-hq.webp",
  business: "/marketing/hotel-hubs/business-hq.webp",
  boutique: "/marketing/hotel-hubs/boutique-hq.webp",
};

function hotelImageAlt(variant: BrandVariant, lang: Lang) {
  if (lang === "bg") return `Илюстративна визия за ${variant.label.toLowerCase()} хотел`;
  if (lang === "de") return `Illustrative Ansicht für ein ${variant.label}-Hotel`;
  return `Illustrative ${variant.label.toLowerCase()} hotel visual`;
}

function HubPreview({ variant, lang }: { variant: BrandVariant; lang: Lang }) {
  const labels =
    lang === "bg"
      ? ["Информация", "Ресторанти", "Услуги", "AI асистент"]
      : lang === "de"
        ? ["Info", "Restaurants", "Services", "AI-Assistent"]
        : ["Information", "Dining", "Services", "AI assistant"];

  return (
    <div className="mx-auto w-full max-w-[240px] rounded-[30px] border border-slate-300 bg-[#0a0f18] p-2 shadow-[0_26px_64px_rgba(15,58,91,.18)]">
      <div
        className={"min-h-[470px] overflow-hidden rounded-[23px] " + variant.fontClass}
        style={{ background: variant.surface, color: variant.text }}
      >
        <div className="relative h-32 overflow-hidden">
          <Image
            src={HOTEL_IMAGES[variant.key]}
            alt={hotelImageAlt(variant, lang)}
            fill
            sizes="(max-width: 640px) 240px, 240px"
            quality={95}
            priority={variant.key === "resort"}
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                variant.key === "luxury"
                  ? "linear-gradient(to bottom, rgba(4,5,6,.28), rgba(4,5,6,.05) 45%, rgba(4,5,6,.52))"
                  : variant.key === "boutique"
                    ? "linear-gradient(to bottom, rgba(38,27,22,.20), rgba(38,27,22,.02) 52%, rgba(38,27,22,.34))"
                    : "linear-gradient(to bottom, rgba(0,0,0,.28), rgba(0,0,0,.06), rgba(0,0,0,.38))",
            }}
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-white drop-shadow">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.22em] text-white/75">Guest Hub</div>
              <div className="mt-1 text-sm font-bold">{variant.hotelName}</div>
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-black/20 text-[10px] font-black backdrop-blur">GH</div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-4">
          <div className="text-xl font-semibold leading-tight">{variant.hero}</div>
          <div className="mt-1.5 text-xs leading-5" style={{ color: variant.muted }}>
            {variant.description}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {variant.quick.map((item) => (
              <span
                key={item}
                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                style={{
                  borderColor: "rgba(20,121,211,.34)",
                  color: "#1479d3",
                  background: "rgba(20,121,211,.08)",
                }}
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {labels.map((label, index) => (
              <div
                key={label}
                className="min-h-16 rounded-xl border p-2.5 shadow-sm"
                style={{
                  borderColor: "rgba(20,121,211,.22)",
                  background: variant.card,
                  boxShadow:
                    variant.key === "luxury"
                      ? "0 12px 28px rgba(0,0,0,.24)"
                      : variant.key === "boutique"
                        ? "0 12px 26px rgba(51,40,36,.08)"
                        : "0 6px 14px rgba(15,23,42,.06)",
                }}
              >
                <div className="grid h-7 w-7 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: "#1479d3" }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-2 text-[11px] font-semibold">{label}</div>
                <div className="mt-1 h-1.5 w-12 rounded-full" style={{ background: "rgba(20,121,211,.22)" }} />
              </div>
            ))}
          </div>

          <div
            className="mt-3 rounded-xl border p-3"
            style={{
              borderColor: "rgba(20,121,211,.24)",
              background: variant.card,
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: variant.muted }}>
              {lang === "bg" ? "Препоръчано за вас" : lang === "de" ? "Für Sie empfohlen" : "Recommended for you"}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">{variant.quick[0]}</div>
                <div className="mt-1 text-[10px] leading-4" style={{ color: variant.muted }}>
                  {lang === "bg" ? "Персонализирано според типа хотел" : lang === "de" ? "Auf den Hoteltyp abgestimmt" : "Tailored to the hotel type"}
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white"
                style={{ background: "#1479d3" }}
              >
                {lang === "bg" ? "Виж" : lang === "de" ? "Öffnen" : "View"}
              </button>
            </div>
          </div>

          <div
            className="mt-3 rounded-xl p-3 text-xs font-semibold text-white shadow-lg"
            style={{ background: "#1479d3" }}
          >
            {lang === "bg" ? "Заявете услуга" : lang === "de" ? "Service anfragen" : "Request a service"}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandWords({ text }: { text: string }) {
  return <>{text.split(/(GOSTAYA)/g).map((part, index) => part === "GOSTAYA" ? <span key={index} className="font-black text-[#1479d3]">{part}</span> : part)}</>;
}

export default function BrandHubShowcase({
  lang,
  eyebrow,
  title,
  text,
}: {
  lang: Lang;
  eyebrow: string;
  title: string;
  text: string;
}) {
  const c = COPY[lang];
  const [activeKey, setActiveKey] = useState<BrandVariant["key"]>("boutique");
  const active = useMemo(
    () => c.variants.find((variant) => variant.key === activeKey) || c.variants[0],
    [activeKey, c.variants],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_270px] lg:items-center">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[.22em] text-[#1479d3]">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-tight text-[#102a43] sm:text-4xl">
          <BrandWords text={title} />
        </h2>
        <p className="gostaya-mobile-justify mt-3 max-w-3xl whitespace-pre-line text-base leading-7 text-slate-600">
          <BrandWords text={text} />
        </p>

        <p className="mt-6 text-sm font-bold text-[#102a43]">{c.helper}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label={c.choose}>
          {c.variants.map((variant) => {
            const selected = active.key === variant.key;
            return (
              <button
                key={variant.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveKey(variant.key)}
                className={
                  "gostaya-hotel-type-chip min-h-[50px] rounded-2xl border px-3 py-2 text-center text-sm font-bold transition " +
                  (selected
                    ? "border-[#1479d3] bg-[#eef7ff] text-[#1479d3] shadow-sm"
                    : "border-[#cfe8fb] bg-white text-[#075985] hover:border-[#8fcaf2]")
                }
              >
                {variant.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-[22px] border border-[#cfe8fb] bg-[#f8fbfe] p-5">
          <div className="text-sm font-black text-[#102a43]">{active.label}</div>
          <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{active.description}</div>
        </div>
      </div>

      <div>
        <div className="mb-3 text-center text-[10px] font-black uppercase tracking-[.18em] text-slate-400">
          {c.preview}
        </div>
        <HubPreview variant={active} lang={lang} />
      </div>
    </div>
  );
}
