"use client";
import MarketingIcon from "./MarketingIcon";


import Image from "next/image";
import { useState } from "react";

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

function HubPreview({variant,lang}:{variant:BrandVariant;lang:Lang}) {
  const labels=lang==="bg"?["Информация","Ресторанти","Услуги","AI асистент"]:lang==="de"?["Information","Restaurants","Services","AI-Assistent"]:["Information","Dining","Services","AI assistant"];
  return <div className="gostaya-phone" style={{background:variant.surface,color:variant.text}}>
    <div className="gostaya-phone-top"><span>9:41</span><span aria-hidden="true">● ▰</span></div>
    <div className="gostaya-phone-photo"><Image src={HOTEL_IMAGES[variant.key]} alt={hotelImageAlt(variant,lang)} fill sizes="220px" className="object-cover"/><span>{variant.hotelName}</span></div>
    <div className={`gostaya-phone-content ${variant.fontClass}`}><h3>{lang==="bg"?"Добре дошли!":lang==="de"?"Willkommen!":"Welcome!"}</h3><p style={{color:variant.muted}}>{variant.hero}</p>
      <div className="gostaya-phone-tiles">{labels.map((label,i)=><div key={label} style={{background:variant.card,borderColor:variant.accent+"44"}}><span aria-hidden="true"><MarketingIcon name={["info","dining","reception","ai"][i]}/></span>{label}</div>)}</div>
      <div className="gostaya-phone-service" style={{background:variant.accent,color:variant.key==="luxury"?"#171717":"#fff"}}>{lang==="bg"?"Свържи се с нас онлайн":lang==="de"?"Online kontaktieren":"Contact us online"}</div>
      <div className="gostaya-phone-bottom" aria-hidden="true" style={{background:variant.text}}/>
    </div>
  </div>;
}

function BrandWords({ text }: { text: string }) {
  return <>{text.split(/(GOSTAYA)/g).map((part, index) => part === "GOSTAYA" ? <span key={index} className="font-black text-[#1479d3]">{part}</span> : part)}</>;
}

export default function BrandHubShowcase({lang,eyebrow,title,text}:{lang:Lang;eyebrow:string;title:string;text:string}) {
  const c=COPY[lang];const [activeKey,setActiveKey]=useState<BrandVariant["key"]>("boutique");
  const active=c.variants.find(variant=>variant.key===activeKey)||c.variants[0];
  const points=lang==="bg"?["Вашите цветове и типография","Услуги и съдържание за вашия хотел","AI асистент с хотелски знания","Достъп с QR — без задължителна инсталация"]:lang==="de"?["Ihre Farben und Typografie","Hotelindividuelle Services und Inhalte","AI-Assistent mit Hotelwissen","QR-Zugriff — ohne Installationspflicht"]:["Your colors and typography","Your hotel's services and content","AI assistant with hotel knowledge","QR access — no installation required"];
  return <div className="gostaya-brand-grid"><div className="gostaya-brand-copy"><p className="gostaya-eyebrow">{eyebrow}</p><h2><BrandWords text={title}/></h2><p className="gostaya-body"><BrandWords text={text}/></p>
    <p className="gostaya-brand-helper">{c.helper}</p>
    <div className="gostaya-hotel-types" role="group" aria-label={c.choose}>{c.variants.map(variant=><button key={variant.key} type="button" aria-pressed={activeKey===variant.key} onClick={()=>setActiveKey(variant.key)} className="gostaya-hotel-type-chip"><span aria-hidden="true"><MarketingIcon name={variant.key}/></span>{variant.label}</button>)}</div>
    <p className="gostaya-brand-description" aria-live="polite">{active.description}</p>
  </div><div className="gostaya-brand-device"><HubPreview variant={active} lang={lang}/><p className="gostaya-preview-caption">{c.preview}</p></div><ul className="gostaya-brand-features">{points.map(point=><li key={point}><span aria-hidden="true">✓</span>{point}</li>)}</ul></div>;
}
