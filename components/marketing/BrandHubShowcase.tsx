"use client";

import { useMemo, useState } from "react";

type Lang = "bg" | "en" | "de";

type BrandVariant = {
  key: "resort" | "luxury" | "business" | "boutique";
  label: string;
  description: string;
  hotelName: string;
  hero: string;
  accent: string;
  surface: string;
  text: string;
  muted: string;
  fontClass: string;
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
        surface: "#f0f9ff",
        text: "#0c4a6e",
        muted: "#64748b",
        fontClass: "font-sans",
      },
      {
        key: "luxury",
        label: "Луксозен",
        description: "Минималистичен и изтънчен дизайн с престижно, персонално усещане.",
        hotelName: "Maison Aurelia",
        hero: "Вашият престой",
        accent: "#c7a35b",
        surface: "#161616",
        text: "#f7f3ea",
        muted: "#c9c2b6",
        fontClass: "font-serif",
      },
      {
        key: "business",
        label: "Бизнес",
        description: "Корпоративен, строг и функционален стил, ориентиран към бързина, графици и бизнес услуги.",
        hotelName: "Central Executive",
        hero: "Бърз достъп",
        accent: "#2563eb",
        surface: "#f8fafc",
        text: "#172554",
        muted: "#64748b",
        fontClass: "font-sans",
      },
      {
        key: "boutique",
        label: "Бутиков",
        description: "Арт визия с характерна типография и акцент върху уникалната история и чар на хотела.",
        hotelName: "Atelier 17",
        hero: "Историята на мястото",
        accent: "#be185d",
        surface: "#fff7ed",
        text: "#4c1d3d",
        muted: "#78716c",
        fontClass: "font-serif",
      },
    ],
  },
  en: {
    choose: "Choose hotel type",
    preview: "Sample guest hub appearance",
    variants: [
      { key: "resort", label: "Resort", description: "A lively interface focused on activities, beach and entertainment.", hotelName: "Azure Bay Resort", hero: "Today at the hotel", accent: "#0ea5e9", surface: "#f0f9ff", text: "#0c4a6e", muted: "#64748b", fontClass: "font-sans" },
      { key: "luxury", label: "Luxury", description: "A refined, minimal premium look with a highly personal feel.", hotelName: "Maison Aurelia", hero: "Your stay", accent: "#c7a35b", surface: "#161616", text: "#f7f3ea", muted: "#c9c2b6", fontClass: "font-serif" },
      { key: "business", label: "Business", description: "A strict, functional style built around speed, schedules and business services.", hotelName: "Central Executive", hero: "Quick access", accent: "#2563eb", surface: "#f8fafc", text: "#172554", muted: "#64748b", fontClass: "font-sans" },
      { key: "boutique", label: "Boutique", description: "An art-led identity with distinctive typography and a strong sense of place.", hotelName: "Atelier 17", hero: "The story of the place", accent: "#be185d", surface: "#fff7ed", text: "#4c1d3d", muted: "#78716c", fontClass: "font-serif" },
    ],
  },
  de: {
    choose: "Hoteltyp wählen",
    preview: "Beispielansicht des Guest Hubs",
    variants: [
      { key: "resort", label: "Resort", description: "Lebendige Oberfläche mit Fokus auf Aktivitäten, Strand und Unterhaltung.", hotelName: "Azure Bay Resort", hero: "Heute im Hotel", accent: "#0ea5e9", surface: "#f0f9ff", text: "#0c4a6e", muted: "#64748b", fontClass: "font-sans" },
      { key: "luxury", label: "Luxus", description: "Minimalistisches Premium-Design mit persönlicher, hochwertiger Wirkung.", hotelName: "Maison Aurelia", hero: "Ihr Aufenthalt", accent: "#c7a35b", surface: "#161616", text: "#f7f3ea", muted: "#c9c2b6", fontClass: "font-serif" },
      { key: "business", label: "Business", description: "Strenger, funktionaler Stil mit Fokus auf Tempo, Termine und Business-Services.", hotelName: "Central Executive", hero: "Schnellzugriff", accent: "#2563eb", surface: "#f8fafc", text: "#172554", muted: "#64748b", fontClass: "font-sans" },
      { key: "boutique", label: "Boutique", description: "Künstlerischer Look mit charakteristischer Typografie und individueller Hotelgeschichte.", hotelName: "Atelier 17", hero: "Die Geschichte des Ortes", accent: "#be185d", surface: "#fff7ed", text: "#4c1d3d", muted: "#78716c", fontClass: "font-serif" },
    ],
  },
};

function HubPreview({ variant, lang }: { variant: BrandVariant; lang: Lang }) {
  const labels =
    lang === "bg"
      ? ["Информация", "Ресторанти", "Услуги", "AI асистент"]
      : lang === "de"
        ? ["Info", "Restaurants", "Services", "AI-Assistent"]
        : ["Information", "Dining", "Services", "AI assistant"];

  return (
    <div className="mx-auto w-full max-w-[390px] rounded-[36px] border border-slate-300 bg-slate-950 p-2 shadow-[0_28px_70px_rgba(15,58,91,.18)]">
      <div
        className={"min-h-[540px] overflow-hidden rounded-[29px] " + variant.fontClass}
        style={{ background: variant.surface, color: variant.text }}
      >
        <div
          className="relative px-6 pb-8 pt-7"
          style={{
            background: `linear-gradient(135deg, ${variant.accent}22, transparent 62%)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: variant.muted }}>
                Guest Hub
              </div>
              <div className="mt-1 text-lg font-bold">{variant.hotelName}</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-full text-xs font-black text-white" style={{ background: variant.accent }}>
              GH
            </div>
          </div>
          <div className="mt-8 text-3xl font-semibold leading-tight">{variant.hero}</div>
          <div className="mt-2 max-w-[260px] text-sm leading-6" style={{ color: variant.muted }}>
            {variant.description}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          {labels.map((label, index) => (
            <div
              key={label}
              className="min-h-24 rounded-2xl border p-4 shadow-sm"
              style={{
                borderColor: `${variant.accent}33`,
                background: variant.key === "luxury" ? "#202020" : "#ffffff",
              }}
            >
              <div className="grid h-8 w-8 place-items-center rounded-xl text-xs font-black text-white" style={{ background: variant.accent }}>
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="mt-3 text-sm font-semibold">{label}</div>
            </div>
          ))}
        </div>

        <div className="mx-5 mb-5 rounded-2xl p-4 text-sm font-semibold text-white" style={{ background: variant.accent }}>
          {lang === "bg"
            ? "Заявете услуга"
            : lang === "de"
              ? "Service anfragen"
              : "Request a service"}
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
    <div>
      <div className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">
        {c.choose}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label={c.choose}>
        {c.variants.map((variant, index) => (
          <button
            key={variant.key}
            type="button"
            role="tab"
            aria-selected={active.key === variant.key}
            onClick={() => setActiveKey(variant.key)}
            className={
              "rounded-full border px-4 py-2 text-sm font-semibold transition " +
              (active.key === variant.key
                ? "border-[#1479d3] bg-[#1479d3] text-white shadow-md"
                : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-[#1479d3]")
            }
          >
            {String(index + 1).padStart(2, "0")} · {variant.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
        <div className="rounded-[24px] border border-slate-200 bg-[#f8fbfe] p-5">
          <div className="text-xs font-black uppercase tracking-[.2em] text-[#1479d3]">
            {active.label}
          </div>
          <p className="mt-3 text-base leading-7 text-slate-600">{active.description}</p>
        </div>
        <div>
          <div className="mb-3 text-center text-xs font-bold uppercase tracking-[.18em] text-slate-400">
            {c.preview}
          </div>
          <HubPreview variant={active} lang={lang} />
        </div>
      </div>
    </div>
  );
}
