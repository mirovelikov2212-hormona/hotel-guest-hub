"use client";



import Image from "next/image";
import { useState, type CSSProperties } from "react";

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
        accent: "#821bdc",
        secondary: "#6b1eae",
        surface: "#f7effe",
        text: "#401268",
        muted: "#654e79",
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
        surface: "#0d0b0e",
        text: "#f5f0e8",
        muted: "#bfb5a6",
        card: "#19161b",
        fontClass: "font-serif",
        quick: ["Concierge", "Fine Dining", "Spa"],
      },
      {
        key: "business",
        label: "Бизнес",
        description: "Корпоративен, строг и функционален стил, ориентиран към бързина, графици и бизнес услуги.",
        hotelName: "Central Executive",
        hero: "Бърз достъп",
        accent: "#8e31df",
        secondary: "#453553",
        surface: "#faf7fc",
        text: "#371b50",
        muted: "#796689",
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
      { key: "resort", label: "Resort", description: "A lively interface focused on activities, beach and entertainment.", hotelName: "Azure Bay Resort", hero: "Today at the hotel", accent: "#821bdc", secondary: "#6b1eae", surface: "#f7effe", text: "#401268", muted: "#654e79", card: "#ffffff", fontClass: "font-sans", quick: ["Beach", "Activities", "Bars"] },
      { key: "luxury", label: "Luxury", description: "A refined dark premium look designed around prestige and personal attention.", hotelName: "Maison Aurelia", hero: "Your stay", accent: "#c6ad7f", secondary: "#6d5a3f", surface: "#0d0b0e", text: "#f5f0e8", muted: "#bfb5a6", card: "#19161b", fontClass: "font-serif", quick: ["Concierge", "Fine Dining", "Spa"] },
      { key: "business", label: "Business", description: "A strict, functional style built around speed, schedules and business services.", hotelName: "Central Executive", hero: "Quick access", accent: "#8e31df", secondary: "#453553", surface: "#faf7fc", text: "#371b50", muted: "#796689", card: "#ffffff", fontClass: "font-sans", quick: ["Meeting", "Transfer", "Late check-out"] },
      { key: "boutique", label: "Boutique", description: "An art-led identity with distinctive typography and a strong sense of place.", hotelName: "Atelier 17", hero: "The story of the place", accent: "#8c5a44", secondary: "#526b5a", surface: "#f7f2ea", text: "#332824", muted: "#7b6a62", card: "#fffdf9", fontClass: "font-serif", quick: ["Story", "Local Guide", "Breakfast"] },
    ],
  },
  de: {
    choose: "Hoteltyp wählen",
    helper: "Wählen Sie einen Hoteltyp und sehen Sie, wie Ihr Guest Hub aussehen könnte.",
    preview: "Beispielansicht des Guest Hubs",
    variants: [
      { key: "resort", label: "Resort", description: "Lebendige Oberfläche mit Fokus auf Aktivitäten, Strand und Unterhaltung.", hotelName: "Azure Bay Resort", hero: "Heute im Hotel", accent: "#821bdc", secondary: "#6b1eae", surface: "#f7effe", text: "#401268", muted: "#654e79", card: "#ffffff", fontClass: "font-sans", quick: ["Strand", "Aktivitäten", "Bars"] },
      { key: "luxury", label: "Luxus", description: "Minimalistisches Premium-Design mit persönlicher, hochwertiger Wirkung.", hotelName: "Maison Aurelia", hero: "Ihr Aufenthalt", accent: "#c6ad7f", secondary: "#6d5a3f", surface: "#0d0b0e", text: "#f5f0e8", muted: "#bfb5a6", card: "#19161b", fontClass: "font-serif", quick: ["Concierge", "Fine Dining", "Spa"] },
      { key: "business", label: "Business", description: "Strenger, funktionaler Stil mit Fokus auf Tempo, Termine und Business-Services.", hotelName: "Central Executive", hero: "Schnellzugriff", accent: "#8e31df", secondary: "#453553", surface: "#faf7fc", text: "#371b50", muted: "#796689", card: "#ffffff", fontClass: "font-sans", quick: ["Meeting", "Transfer", "Late Check-out"] },
      { key: "boutique", label: "Boutique", description: "Künstlerischer Look mit charakteristischer Typografie und individueller Hotelgeschichte.", hotelName: "Atelier 17", hero: "Die Geschichte des Ortes", accent: "#8c5a44", secondary: "#526b5a", surface: "#f7f2ea", text: "#332824", muted: "#7b6a62", card: "#fffdf9", fontClass: "font-serif", quick: ["Story", "Local Guide", "Frühstück"] },
    ],
  },
};

const IDENTITIES = {
  luxury: { hotelName: "Grand Royale", accent: "#d8b463", secondary: "#2d2a23", surface: "#101113", text: "#f3e8cf", muted: "#a59d8c", card: "#1e1f22", fontClass: "Cormorant Italic", photo: { width:787, height:1047, x:41, y:84, w:452, h:440 }, taglines: ["Изключителност във всеки детайл.", "Excellence in every detail.", "Exzellenz in jedem Detail."] },
  boutique: { hotelName: "Atelier 27", accent: "#3c2b1d", secondary: "#bf7745", surface: "#faf6ef", text: "#3c2b1d", muted: "#60708a", card: "#f4e8d9", fontClass: "Cormorant", photo: { width:638, height:949, x:49, y:172, w:362, h:353 }, taglines: ["История, вкус и вдъхновение в сърцето на града.", "History, taste and inspiration in the heart of the city.", "Geschichte, Genuss und Inspiration im Herzen der Stadt."] },
  business: { hotelName: "Meridian Business", accent: "#133e8f", secondary: "#215cfc", surface: "#f4f6fb", text: "#152135", muted: "#60708a", card: "#ffffff", fontClass: "Onest", photo: { width:654, height:927, x:52, y:160, w:362, h:353 }, taglines: ["Ефективен престой. Всичко под ръка.", "An efficient stay. Everything within reach.", "Effizienter Aufenthalt. Alles griffbereit."] },
  resort: { hotelName: "Azure Bay Resort", accent: "#07928f", secondary: "#7dd9d4", surface: "#f0fbfa", text: "#0c3b3b", muted: "#60708a", card: "#dff6f4", fontClass: "Onest", photo: { width:635, height:925, x:42, y:148, w:362, h:353 }, taglines: ["Слънце, море и безгрижна почивка.", "Sun, sea and a carefree escape.", "Sonne, Meer und unbeschwerte Erholung."] },
} as const;

function HubPreview({variant,lang}:{variant:BrandVariant;lang:Lang}) {
  const identity=IDENTITIES[variant.key];
  const photo=identity.photo;
  const serif=identity.fontClass.startsWith("Cormorant");
  const labels=lang==="bg"?["Услуги","Ресторант","Spa","AI асистент"]:lang==="de"?["Services","Restaurant","Spa","AI-Assistent"]:["Services","Restaurant","Spa","AI assistant"];
  const style={"--hotel-surface":identity.surface,"--hotel-ink":identity.text,"--hotel-accent":identity.accent,"--hotel-muted":identity.muted,"--hotel-card":identity.card,"--hotel-font":serif?'"Cormorant", Georgia, serif':'"Onest", Arial, sans-serif',"--hotel-font-style":variant.key==="luxury"?"italic":"normal"} as CSSProperties;
  return <div className="gostaya-reference-phone" data-hotel-type={variant.key} style={style}>
    <div className="gostaya-reference-notch" aria-hidden="true"/>
    <div className="gostaya-reference-hotel"><strong>{identity.hotelName}</strong><span>{lang.toUpperCase()} <span aria-hidden="true">▾</span></span></div>
    <div className="gostaya-reference-photo" style={{aspectRatio:`${photo.w}/${photo.h}`}}>
      <Image src={`/marketing/hotel-hubs/${variant.key}-reference.png`} alt={identity.hotelName} width={photo.width} height={photo.height} sizes="500px" style={{width:`${photo.width/photo.w*100}%`,height:`${photo.height/photo.h*100}%`,maxWidth:"none",left:`${-photo.x/photo.w*100}%`,top:`${-photo.y/photo.h*100}%`}}/>
    </div>
    <div className="gostaya-reference-welcome"><p>{lang==="bg"?"Добре дошли в":lang==="de"?"Willkommen im":"Welcome to"}</p><h3>{identity.hotelName}</h3><p>{identity.taglines[lang==="bg"?0:lang==="en"?1:2]}</p></div>
    <div className="gostaya-reference-tiles">{labels.map(label=><div key={label}>{label}</div>)}</div>
    <div className="gostaya-reference-home" aria-hidden="true"/>
  </div>;
}

function BrandWords({ text }: { text: string }) {
  return <>{text.split(/(GOSTAYA)/g).map((part, index) => part === "GOSTAYA" ? <span key={index} className="font-black text-[#791fc8]">{part}</span> : part)}</>;
}

export default function BrandHubShowcase({lang,eyebrow,title,text}:{lang:Lang;eyebrow:string;title:string;text:string}) {
  const c=COPY[lang];const [activeKey,setActiveKey]=useState<BrandVariant["key"]>("boutique");
  const selected=c.variants.find(variant=>variant.key===activeKey)||c.variants[0];const active={...selected,...IDENTITIES[selected.key]};
  const points=lang==="bg"?["Вашите цветове и типография","Услуги и съдържание за вашия хотел","AI асистент с информация само за хотела","Достъп с QR — без задължителна инсталация"]:lang==="de"?["Ihre Farben und Typografie","Hotelindividuelle Services und Inhalte","AI-Assistent mit Hotelwissen","QR-Zugriff — ohne Installationspflicht"]:["Your colors and typography","Your hotel's services and content","AI assistant with hotel knowledge","QR access — no installation required"];
  return <div className="gostaya-brand-grid"><div className="gostaya-brand-copy"><p className="gostaya-eyebrow">{eyebrow}</p><h2><BrandWords text={title}/></h2><p className="gostaya-body"><BrandWords text={text}/></p>
    <p className="gostaya-brand-helper">{c.helper}</p>
    <div className="gostaya-hotel-types" role="group" aria-label={c.choose}>{c.variants.map(variant=><button key={variant.key} type="button" aria-pressed={activeKey===variant.key} onClick={()=>setActiveKey(variant.key)} className="gostaya-hotel-type-chip">{variant.label}</button>)}</div>
    <p className="gostaya-brand-description" aria-live="polite">{active.description}</p>
  </div><div className="gostaya-brand-device"><div className="gostaya-brand-stage"><div key={active.key} className="gostaya-brand-transition"><HubPreview variant={active} lang={lang}/></div><div className="gostaya-brand-palette" aria-label={lang==="bg"?"Бранд палитра":lang==="de"?"Markenfarben":"Brand palette"}><span>{lang==="bg"?"Вашата идентичност":lang==="de"?"Ihre Identität":"Your identity"}</span><div aria-hidden="true">{[active.accent,active.secondary,active.surface,active.text].map((color,i)=><i key={i} style={{background:color}}/>)}</div><strong>Aa · {active.fontClass}</strong></div></div><p className="gostaya-preview-caption">{c.preview}</p></div><ul className="gostaya-brand-features">{points.map(point=><li key={point}><span aria-hidden="true">✓</span>{point}</li>)}</ul></div>;
}
