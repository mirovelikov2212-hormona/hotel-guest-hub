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

const COPY: Record<Lang, { choose: string; preview: string; variants: BrandVariant[] }> = {
  bg: {
    choose: "Изберете тип хотел",
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
    <div className="mx-auto w-full max-w-[390px] rounded-[42px] border border-slate-300 bg-[#0a0f18] p-2.5 shadow-[0_34px_90px_rgba(15,58,91,.22)]">
      <div
        className={"min-h-[780px] overflow-hidden rounded-[33px] " + variant.fontClass}
        style={{ background: variant.surface, color: variant.text }}
      >
        <div className="relative h-64 overflow-hidden">
          <Image
            src={HOTEL_IMAGES[variant.key]}
            alt={hotelImageAlt(variant, lang)}
            fill
            sizes="(max-width: 640px) calc(100vw - 64px), 390px"
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
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-white drop-shadow">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.22em] text-white/75">Guest Hub</div>
              <div className="mt-1 text-base font-bold">{variant.hotelName}</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/20 text-xs font-black backdrop-blur">GH</div>
          </div>
        </div>

        <div className="px-5 pb-6 pt-5">
          <div className="text-3xl font-semibold leading-tight">{variant.hero}</div>
          <div className="mt-2 text-sm leading-6" style={{ color: variant.muted }}>
            {variant.description}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {variant.quick.map((item) => (
              <span
                key={item}
                className="rounded-full border px-3 py-1.5 text-[11px] font-semibold"
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

          <div className="mt-5 grid grid-cols-2 gap-3">
            {labels.map((label, index) => (
              <div
                key={label}
                className="min-h-28 rounded-2xl border p-4 shadow-sm"
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
                <div className="grid h-8 w-8 place-items-center rounded-xl text-xs font-black text-white" style={{ background: "#1479d3" }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-4 text-sm font-semibold">{label}</div>
                <div className="mt-1 h-1.5 w-12 rounded-full" style={{ background: "rgba(20,121,211,.22)" }} />
              </div>
            ))}
          </div>

          <div
            className="mt-5 rounded-2xl border p-4"
            style={{
              borderColor: "rgba(20,121,211,.24)",
              background: variant.card,
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: variant.muted }}>
              {lang === "bg" ? "Препоръчано за вас" : lang === "de" ? "Für Sie empfohlen" : "Recommended for you"}
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">{variant.quick[0]}</div>
                <div className="mt-1 text-xs" style={{ color: variant.muted }}>
                  {lang === "bg" ? "Персонализирано според типа хотел" : lang === "de" ? "Auf den Hoteltyp abgestimmt" : "Tailored to the hotel type"}
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-xs font-bold text-white"
                style={{ background: "#1479d3" }}
              >
                {lang === "bg" ? "Виж" : lang === "de" ? "Öffnen" : "View"}
              </button>
            </div>
          </div>

          <div
            className="mt-5 rounded-2xl p-4 text-sm font-semibold text-white shadow-lg"
            style={{ background: "#1479d3" }}
          >
            {lang === "bg" ? "Заявете услуга" : lang === "de" ? "Service anfragen" : "Request a service"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandHubShowcase({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const [activeKey, setActiveKey] = useState<BrandVariant["key"]>("resort");
  const active = useMemo(
    () => c.variants.find((variant) => variant.key === activeKey) || c.variants[0],
    [activeKey, c.variants],
  );

  return (
    <div className="grid gap-7 lg:grid-cols-[430px_1fr] lg:items-start">
      <div>
        <div className="mx-auto mb-4 grid w-full max-w-[390px] grid-cols-2 gap-2 lg:hidden" role="tablist" aria-label={c.choose}>
          {c.variants.map((variant, index) => {
            const selected = active.key === variant.key;
            return (
              <button
                key={variant.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveKey(variant.key)}
                className={
                  "gostaya-hotel-type-chip grid min-h-[54px] place-items-center rounded-full border px-3 py-2 text-center text-sm font-bold transition " +
                  (selected
                    ? "border-[#8fcaf2] bg-[#eef6ff] text-[#102a43] shadow-sm"
                    : "border-slate-200 bg-white text-slate-600")
                }
              >
                <span>{String(index + 1).padStart(2, "0")} · {variant.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mb-3 text-center text-xs font-bold uppercase tracking-[.18em] text-slate-400">
          {c.preview}
        </div>
        <HubPreview variant={active} lang={lang} />
      </div>

      <div className="hidden lg:block">
        <div className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">
          {c.choose}
        </div>
        <div className="mt-3 grid gap-3" role="tablist" aria-label={c.choose}>
          {c.variants.map((variant, index) => {
            const selected = active.key === variant.key;
            return (
              <button
                key={variant.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveKey(variant.key)}
                className={
                  "gostaya-hotel-type-option group w-full rounded-full border p-5 text-left transition " +
                  (selected
                    ? "border-[#8fcaf2] bg-[#eef6ff] shadow-[0_16px_40px_rgba(15,58,91,.10)]"
                    : "border-slate-200 bg-white hover:border-sky-300 hover:shadow-md")
                }
              >
                <div className="flex items-start gap-4">
                  <div
                    className={
                      "grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xs font-black " +
                      (selected ? "bg-[#1479d3] text-white" : "bg-slate-100 text-slate-500 group-hover:bg-sky-50 group-hover:text-[#1479d3]")
                    }
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-[#102a43]">{variant.label}</div>
                    <div className="mt-1.5 text-sm leading-6 text-slate-600">{variant.description}</div>
                  </div>
                  <div
                    className="ml-auto mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ background: selected ? "#1479d3" : "#dbe4ee" }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
