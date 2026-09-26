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
        accent: "#c7a35b",
        surface: "#131313",
        text: "#f7f3ea",
        muted: "#c9c2b6",
        card: "#1f1f1f",
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
        accent: "#be185d",
        surface: "#fff8f2",
        text: "#4c1d3d",
        muted: "#7c5d69",
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
      { key: "resort", label: "Resort", description: "A lively interface focused on activities, beach and entertainment.", hotelName: "Azure Bay Resort", hero: "Today at the hotel", accent: "#0ea5e9", surface: "#eefbff", text: "#0c4a6e", muted: "#4b6b7c", card: "#ffffff", fontClass: "font-sans", quick: ["Beach", "Activities", "Bars"] },
      { key: "luxury", label: "Luxury", description: "A refined dark premium look designed around prestige and personal attention.", hotelName: "Maison Aurelia", hero: "Your stay", accent: "#c7a35b", surface: "#131313", text: "#f7f3ea", muted: "#c9c2b6", card: "#1f1f1f", fontClass: "font-serif", quick: ["Concierge", "Fine Dining", "Spa"] },
      { key: "business", label: "Business", description: "A strict, functional style built around speed, schedules and business services.", hotelName: "Central Executive", hero: "Quick access", accent: "#2563eb", surface: "#f7f9fc", text: "#172554", muted: "#64748b", card: "#ffffff", fontClass: "font-sans", quick: ["Meeting", "Transfer", "Late check-out"] },
      { key: "boutique", label: "Boutique", description: "An art-led identity with distinctive typography and a strong sense of place.", hotelName: "Atelier 17", hero: "The story of the place", accent: "#be185d", surface: "#fff8f2", text: "#4c1d3d", muted: "#7c5d69", card: "#fffdf9", fontClass: "font-serif", quick: ["Story", "Local Guide", "Breakfast"] },
    ],
  },
  de: {
    choose: "Hoteltyp wählen",
    preview: "Beispielansicht des Guest Hubs",
    variants: [
      { key: "resort", label: "Resort", description: "Lebendige Oberfläche mit Fokus auf Aktivitäten, Strand und Unterhaltung.", hotelName: "Azure Bay Resort", hero: "Heute im Hotel", accent: "#0ea5e9", surface: "#eefbff", text: "#0c4a6e", muted: "#4b6b7c", card: "#ffffff", fontClass: "font-sans", quick: ["Strand", "Aktivitäten", "Bars"] },
      { key: "luxury", label: "Luxus", description: "Minimalistisches Premium-Design mit persönlicher, hochwertiger Wirkung.", hotelName: "Maison Aurelia", hero: "Ihr Aufenthalt", accent: "#c7a35b", surface: "#131313", text: "#f7f3ea", muted: "#c9c2b6", card: "#1f1f1f", fontClass: "font-serif", quick: ["Concierge", "Fine Dining", "Spa"] },
      { key: "business", label: "Business", description: "Strenger, funktionaler Stil mit Fokus auf Tempo, Termine und Business-Services.", hotelName: "Central Executive", hero: "Schnellzugriff", accent: "#2563eb", surface: "#f7f9fc", text: "#172554", muted: "#64748b", card: "#ffffff", fontClass: "font-sans", quick: ["Meeting", "Transfer", "Late Check-out"] },
      { key: "boutique", label: "Boutique", description: "Künstlerischer Look mit charakteristischer Typografie und individueller Hotelgeschichte.", hotelName: "Atelier 17", hero: "Die Geschichte des Ortes", accent: "#be185d", surface: "#fff8f2", text: "#4c1d3d", muted: "#7c5d69", card: "#fffdf9", fontClass: "font-serif", quick: ["Story", "Local Guide", "Frühstück"] },
    ],
  },
};

function HotelScene({ variant }: { variant: BrandVariant }) {
  if (variant.key === "resort") {
    return (
      <div className="relative h-56 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-300 via-sky-100 to-cyan-100" />
        <div className="absolute right-8 top-7 h-16 w-16 rounded-full bg-amber-200 shadow-[0_0_28px_rgba(251,191,36,.5)]" />
        <div className="absolute bottom-0 left-0 h-20 w-full bg-gradient-to-b from-cyan-300 to-sky-500" />
        <div className="absolute bottom-12 left-10 h-24 w-44 rounded-t-[32px] bg-white/95 shadow-xl" />
        <div className="absolute bottom-14 left-20 h-16 w-24 rounded-t-2xl bg-cyan-50" />
        <div className="absolute bottom-10 right-10 h-16 w-28 rounded-[999px] bg-cyan-200/90 ring-4 ring-white/80" />
        <div className="absolute bottom-16 left-4 h-24 w-3 rotate-6 rounded-full bg-amber-800/80" />
        <div className="absolute bottom-32 left-0 h-12 w-24 rounded-full bg-emerald-400/80" />
      </div>
    );
  }

  if (variant.key === "luxury") {
    return (
      <div className="relative h-56 overflow-hidden bg-[#0b0b0b]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(199,163,91,.35),transparent_30%),linear-gradient(160deg,#171717,#080808)]" />
        <div className="absolute bottom-0 left-0 h-36 w-full bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-8 left-8 h-28 w-40 rounded-[24px] border border-white/10 bg-gradient-to-br from-[#2d2b29] to-[#161514] shadow-2xl" />
        <div className="absolute bottom-12 left-14 h-16 w-28 rounded-[16px] bg-[#d8c8ad]" />
        <div className="absolute bottom-10 right-8 h-32 w-36 rounded-t-[28px] border border-[#c7a35b]/30 bg-gradient-to-b from-[#2b2926] to-[#141414]" />
        <div className="absolute right-16 top-8 h-20 w-20 rounded-full border border-[#c7a35b]/30 bg-[#c7a35b]/10 shadow-[0_0_40px_rgba(199,163,91,.25)]" />
      </div>
    );
  }

  if (variant.key === "business") {
    return (
      <div className="relative h-56 overflow-hidden bg-gradient-to-b from-slate-200 via-slate-100 to-white">
        <div className="absolute bottom-0 left-5 h-44 w-28 rounded-t-xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-xl" />
        <div className="absolute bottom-0 left-40 h-36 w-20 rounded-t-lg bg-gradient-to-br from-blue-500 to-blue-800" />
        <div className="absolute bottom-0 right-10 h-40 w-32 rounded-t-xl bg-gradient-to-br from-slate-500 to-slate-800" />
        <div className="absolute left-10 top-9 grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }).map((_, i) => <span key={i} className="h-2.5 w-4 rounded-sm bg-sky-200/80" />)}
        </div>
        <div className="absolute right-16 top-11 rounded-xl bg-white/90 px-4 py-3 text-xs font-bold text-slate-700 shadow-lg">09:00 · Meeting</div>
      </div>
    );
  }

  return (
    <div className="relative h-56 overflow-hidden bg-gradient-to-br from-rose-100 via-orange-50 to-amber-50">
      <div className="absolute left-10 top-8 h-40 w-52 rounded-t-[80px] border-[10px] border-[#d89a73] bg-[#f6e5d6] shadow-xl" />
      <div className="absolute bottom-0 left-0 h-20 w-full bg-[#d9c2a8]" />
      <div className="absolute bottom-8 left-24 h-24 w-24 rounded-t-[48px] bg-[#5d2e46]" />
      <div className="absolute right-8 top-14 h-28 w-20 rounded-full bg-emerald-500/70 blur-[1px]" />
      <div className="absolute right-16 top-6 h-24 w-4 rotate-12 rounded-full bg-emerald-800/60" />
      <div className="absolute left-6 top-10 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[#7c2d4a] shadow">Since 1927</div>
    </div>
  );
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
        <div className="relative">
          <HotelScene variant={variant} />
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
                style={{ borderColor: variant.accent + "55", color: variant.accent, background: variant.accent + "12" }}
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
                  borderColor: variant.accent + "33",
                  background: variant.card,
                }}
              >
                <div className="grid h-8 w-8 place-items-center rounded-xl text-xs font-black text-white" style={{ background: variant.accent }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-4 text-sm font-semibold">{label}</div>
                <div className="mt-1 h-1.5 w-12 rounded-full" style={{ background: variant.accent + "38" }} />
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: variant.accent + "33", background: variant.card }}>
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
              <button type="button" className="rounded-xl px-3 py-2 text-xs font-bold text-white" style={{ background: variant.accent }}>
                {lang === "bg" ? "Виж" : lang === "de" ? "Öffnen" : "View"}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl p-4 text-sm font-semibold text-white shadow-lg" style={{ background: variant.accent }}>
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
        <div className="mb-3 text-center text-xs font-bold uppercase tracking-[.18em] text-slate-400">
          {c.preview}
        </div>
        <HubPreview variant={active} lang={lang} />
      </div>

      <div>
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
                  "group w-full rounded-[24px] border p-5 text-left transition " +
                  (selected
                    ? "border-[#1479d3] bg-gradient-to-r from-sky-50 to-violet-50 shadow-[0_16px_40px_rgba(15,58,91,.10)]"
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
                    style={{ background: selected ? variant.accent : "#dbe4ee" }}
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
