"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type {
  HotelIntelligencePackage,
  HotelOnboardingSource,
  HotelOnboardingSourceCategory,
} from "@/lib/product-factory/hotel-intelligence-package";

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";
const TEST_HUB_STORAGE_KEY = "stayhub:test-hub-package:v1";

type Lang = "bg" | "en";
type CardKey =
  | "reception"
  | "housekeeping"
  | "maintenance"
  | "info"
  | "extras"
  | "gastronomy"
  | "wellness"
  | "around"
  | "weather"
  | "reviews"
  | "emergency";

type HubCard = {
  key: CardKey;
  title: string;
  subtitle?: string;
  icon: IconName;
  available: boolean;
  manual?: boolean;
  danger?: boolean;
};

type IconName =
  | "desk"
  | "clean"
  | "tool"
  | "info"
  | "bed"
  | "dining"
  | "spa"
  | "activity"
  | "gift"
  | "doc"
  | "pin"
  | "weather"
  | "star"
  | "alert";

const COPY = {
  bg: {
    preview: "TEST HUB · Design Studio Preview",
    demoRoom: "Демо стая 101",
    roomConfirmed: "Стаята е потвърдена",
    intro: "Това е визуален тест на бъдещия guest hub. Нищо не се изпраща към реален хотел.",
    reception: "Онлайн рецепция",
    housekeeping: "Онлайн хаускипинг",
    maintenance: "Технически отдел",
    info: "Информация за хотела",
    extras: "Допълнителни услуги",
    gastronomy: "Ресторанти и барове",
    wellness: "SPA & Wellness",
    policies: "Политики / FAQ",
    around: "Около хотела",
    weather: "Времето",
    reviews: "Отзиви",
    emergency: "Спешна помощ",
    manual: "Попълва се ръчно при onboarding",
    draft: "Чернова от onboarding източници",
    close: "Затвори",
    back: "Назад към Design Studio",
    contact: "Контакти",
    checkIn: "Check-in",
    checkOut: "Check-out",
    parking: "Паркинг",
    phone: "Телефон",
    address: "Адрес",
    noData: "Няма потвърдено съдържание. Добавя се ръчно при onboarding.",
    sourceOnly: "Открити са публични източници. Съдържанието се преглежда и подрежда ръчно преди публикуване.",
    requestTitle: "Тестова заявка",
    requestBody: "Напиши какво ти е необходимо.",
    send: "Изпрати тестова заявка",
    idle: "Няма активна заявка",
    sent: "Заявката е изпратена",
    accepted: "Заявката е приета",
    completed: "Заявката е приключена",
    home: "Начало",
    services: "Услуги",
    hotel: "Хотел",
    more: "Още",
  },
  en: {
    preview: "TEST HUB · Design Studio Preview",
    demoRoom: "Demo room 101",
    roomConfirmed: "Room confirmed",
    intro: "This is a visual test of the future guest hub. Nothing is sent to a real hotel.",
    reception: "Online reception",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    info: "Hotel information",
    extras: "Additional services",
    gastronomy: "Restaurants & bars",
    wellness: "SPA & Wellness",
    policies: "Policies / FAQ",
    around: "Around the hotel",
    weather: "Weather",
    reviews: "Reviews",
    emergency: "Emergency",
    manual: "Added manually during onboarding",
    draft: "Draft from onboarding sources",
    close: "Close",
    back: "Back to Design Studio",
    contact: "Contacts",
    checkIn: "Check-in",
    checkOut: "Check-out",
    parking: "Parking",
    phone: "Phone",
    address: "Address",
    noData: "No confirmed content yet. It is added manually during onboarding.",
    sourceOnly: "Public sources were discovered. Content is reviewed and arranged manually before publishing.",
    requestTitle: "Test request",
    requestBody: "Tell the hotel what you need.",
    send: "Send test request",
    idle: "No active request",
    sent: "Request sent",
    accepted: "Request accepted",
    completed: "Request completed",
    home: "Home",
    services: "Services",
    hotel: "Hotel",
    more: "More",
  },
} as const;

const CATEGORY_FOR_CARD: Partial<Record<CardKey, HotelOnboardingSourceCategory>> = {
  extras: "services",
  gastronomy: "gastronomy",
  wellness: "wellness",
};

const ICONS: Record<IconName, string[]> = {
  desk: ["M4 13h16", "M6 13v6", "M18 13v6", "M8 9a4 4 0 0 1 8 0", "M12 4v1"],
  clean: ["M8 4h8", "M9 4v4", "M15 4v4", "M7 8h10l-1 11H8L7 8Z"],
  tool: ["M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-3 3-2-2 2-3Z"],
  info: ["M12 17v-6", "M12 7h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  bed: ["M3 18v-7", "M21 18v-5", "M3 15h18", "M6 11V7h5a3 3 0 0 1 3 3v1"],
  dining: ["M6 3v8", "M3 3v5a3 3 0 0 0 6 0V3", "M6 11v10", "M17 3v18", "M17 3c3 2 3 7 0 9"],
  spa: ["M12 21c4-3 7-7 7-11-4 0-7 2-7 5-1-3-4-5-7-5 0 4 3 8 7 11Z", "M12 15c0-5 2-8 5-11"],
  activity: ["M8 19c2-4 4-7 8-10", "M7 7h.01", "M15 5h.01", "M5 15l4-4 3 2 5-5 2 2"],
  gift: ["M4 10h16v11H4z", "M12 10v11", "M3 6h18v4H3z", "M12 6c-1-3-5-4-5-1 0 2 2 2 5 1Z", "M12 6c1-3 5-4 5-1 0 2-2 2-5 1Z"],
  doc: ["M6 3h8l4 4v14H6z", "M14 3v5h5", "M9 13h6", "M9 17h6"],
  pin: ["M12 21s6-5 6-11a6 6 0 1 0-12 0c0 6 6 11 6 11Z", "M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  weather: ["M8 18h9a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 8 18Z", "M16 3v2", "M20 5l-1.5 1.5"],
  star: ["m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.8 6.4 21l1.1-6.2L3 10.6l6.2-.9L12 3Z"],
  alert: ["M12 3 2.5 20h19L12 3Z", "M12 9v4", "M12 17h.01"],
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&quot;|&ldquo;|&rdquo;/giu, '"')
    .replace(/&apos;|&#39;|&lsquo;|&rsquo;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}


function normalizedHex(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/u.test(raw)) {
    return "#" + raw.slice(1).split("").map((part) => part + part).join("");
  }
  return fallback;
}

function rgb(hex: string) {
  const value = normalizedHex(hex, "#000000");
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function relativeLuminance(hex: string) {
  const { r, g, b } = rgb(hex);
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(left: string, right: string) {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(left: string, right: string, rightWeight: number) {
  const a = rgb(left);
  const b = rgb(right);
  const mix = (x: number, y: number) => Math.round(x * (1 - rightWeight) + y * rightWeight);
  return "#" + [mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
}

function brandRole(pkg: HotelIntelligencePackage, role: string) {
  const match = pkg.designIntelligenceLayer.brandKit?.colorRoles.find((signal) =>
    signal.role === role
    && signal.confidence >= 0.8
    && /rendered|visible/iu.test(String(signal.evidence || "")));
  return match?.color || "";
}

function fontStack(font: string, fallback: string) {
  const value = cleanText(font);
  return value ? `"${value}", ${fallback}` : fallback;
}

function buildGuestTheme(pkg: HotelIntelligencePackage) {
  const background = normalizedHex(brandRole(pkg, "page_background"), "#f2f0ed");
  const text = normalizedHex(brandRole(pkg, "text"), "#352c2b");
  const surface = normalizedHex(brandRole(pkg, "surface"), "#ffffff");
  const hero = normalizedHex(brandRole(pkg, "hero_background"), background);
  const primary = normalizedHex(
    brandRole(pkg, "primary") || brandRole(pkg, "button_background"),
    text,
  );
  const declaredButtonText = normalizedHex(brandRole(pkg, "button_text"), text);
  const buttonText = contrastRatio(primary, declaredButtonText) >= 4.5
    ? declaredButtonText
    : contrastRatio(primary, background) >= 4.5
      ? background
      : contrastRatio(primary, "#ffffff") >= contrastRatio(primary, "#000000")
        ? "#ffffff"
        : "#000000";

  const headingFont = pkg.designIntelligenceLayer.brandKit?.typography.headingFont || "";
  const bodyFont = pkg.designIntelligenceLayer.brandKit?.typography.bodyFont || "";
  const buttonFont = pkg.designIntelligenceLayer.brandKit?.typography.buttonFont || "";
  const cardRadius = pkg.designIntelligenceLayer.brandKit?.visualCues.cardRadius || "20px";
  const buttonRadius = pkg.designIntelligenceLayer.brandKit?.visualCues.buttonRadius || "0px";

  return {
    background,
    text,
    surface,
    hero,
    primary,
    buttonText,
    border: rgba(text, 0.16),
    muted: mixHex(text, background, 0.58),
    soft: mixHex(primary, background, 0.90),
    overlay: rgba(text, 0.34),
    headingFont: fontStack(headingFont, "Georgia, serif"),
    bodyFont: fontStack(bodyFont, "Arial, sans-serif"),
    buttonFont: fontStack(buttonFont, "Arial, sans-serif"),
    cardRadius,
    buttonRadius,
  };
}

type HubTheme = ReturnType<typeof buildGuestTheme>;


function selectedLanguageSources(sources: HotelOnboardingSource[]) {
  const english = sources.filter((source) => /\/en(?:\/|$)/iu.test(new URL(source.url).pathname));
  if (english.length) return english;
  const german = sources.filter((source) => /\/de(?:\/|$)/iu.test(new URL(source.url).pathname));
  if (german.length) return german;
  return sources;
}

function curatedNames(sources: HotelOnboardingSource[], category: HotelOnboardingSourceCategory) {
  const seen = new Set<string>();
  const generic = category === "accommodation"
    ? /^(?:rooms?|zimmer|accommodation|unterkunft)$/iu
    : category === "gastronomy"
      ? /^(?:gastronomy|gastronomie|dining)$/iu
      : category === "offers"
        ? /^(?:offers?|packages?|angebote)$/iu
        : /$^/u;

  const result: string[] = [];
  for (const source of selectedLanguageSources(sources)) {
    const title = cleanText(source.title);
    const key = title.toLocaleLowerCase("en-US");
    if (!title || generic.test(title) || seen.has(key)) continue;
    seen.add(key);
    result.push(title);
    if (result.length >= 8) break;
  }
  return result;
}

function categorySources(pkg: HotelIntelligencePackage, category: HotelOnboardingSourceCategory) {
  return (pkg.onboardingSources || []).filter((source) => source.category === category);
}

function hotelDisplayName(pkg: HotelIntelligencePackage) {
  const raw = cleanText(pkg.hotelProfileLayer.identity.hotelName);
  if (raw && raw.length <= 54 && !/[|:]/u.test(raw)) return raw;
  try {
    const host = new URL(pkg.source.canonicalUrl || pkg.source.requestedUrl).hostname.replace(/^www\./u, "");
    const brand = host.split(".")[0]?.replace(/[-_]+/gu, " ").trim() || "Hotel";
    return brand.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
  } catch {
    return raw || "Hotel";
  }
}

function hasSources(pkg: HotelIntelligencePackage, category: HotelOnboardingSourceCategory) {
  return categorySources(pkg, category).length > 0;
}

function cardAvailable(pkg: HotelIntelligencePackage, key: CardKey) {
  const category = CATEGORY_FOR_CARD[key];
  if (category) return categorySources(pkg, category).length > 0;
  return true;
}

function useStoredPackage() {
  const [pkg, setPkg] = useState<HotelIntelligencePackage | null>(null);

  useEffect(() => {
    const candidates = [
      window.localStorage.getItem(TEST_HUB_STORAGE_KEY),
      window.sessionStorage.getItem(PACKAGE_STORAGE_KEY),
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as HotelIntelligencePackage;
        if (parsed?.schemaVersion === "hotel-intelligence-v1") {
          setPkg(parsed);
          return;
        }
      } catch {}
    }
  }, []);

  return pkg;
}

export default function TestHubPreviewClient({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const pkg = useStoredPackage();
  const [active, setActive] = useState<CardKey | null>(null);
  const [requestStatus, setRequestStatus] = useState<"idle" | "sent" | "accepted" | "completed">("idle");
  const [requestText, setRequestText] = useState("");

  const cards = useMemo<HubCard[]>(() => {
    if (!pkg) return [];
    return [
      { key: "reception", title: copy.reception, icon: "desk", available: true },
      { key: "housekeeping", title: copy.housekeeping, icon: "clean", available: true },
      { key: "maintenance", title: copy.maintenance, icon: "tool", available: true },
      { key: "info", title: copy.info, icon: "info", available: true },
      { key: "extras", title: copy.extras, icon: "gift", available: true, manual: !cardAvailable(pkg, "extras") },
      { key: "gastronomy", title: copy.gastronomy, icon: "dining", available: true, manual: !cardAvailable(pkg, "gastronomy") },
      { key: "wellness", title: copy.wellness, icon: "spa", available: true, manual: !cardAvailable(pkg, "wellness") },
      { key: "around", title: copy.around, icon: "pin", available: true, manual: true },
      { key: "weather", title: copy.weather, icon: "weather", available: true },
      { key: "reviews", title: copy.reviews, icon: "star", available: true, manual: true },
      { key: "emergency", title: copy.emergency, icon: "alert", available: true, manual: true, danger: true },
    ];
  }, [pkg, copy]);

  useEffect(() => {
    if (requestStatus !== "sent") return;
    const accepted = window.setTimeout(() => setRequestStatus("accepted"), 900);
    const completed = window.setTimeout(() => setRequestStatus("completed"), 2100);
    return () => {
      window.clearTimeout(accepted);
      window.clearTimeout(completed);
    };
  }, [requestStatus]);

  if (!pkg) {
    return (
      <main className="min-h-screen bg-[#f4fbfa] p-6 text-[#123f42]">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-[#b9e7e2] bg-white p-7 shadow-xl">
          <h1 className="text-2xl font-bold">Test Hub Preview</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Open this page from Design Studio so the current Hotel Intelligence Package can be handed to the preview.</p>
          <Link href={`/design-studio?lang=${lang}`} className="mt-5 inline-flex rounded-xl bg-[#43b5a1] px-4 py-3 text-sm font-semibold text-white">{copy.back}</Link>
        </div>
      </main>
    );
  }

  const currentPkg = pkg;
  const theme = buildGuestTheme(currentPkg);
  const hotelName = hotelDisplayName(currentPkg);
  const info = {
    checkIn: currentPkg.hotelProfileLayer.operations.checkIn || "",
    checkOut: currentPkg.hotelProfileLayer.operations.checkOut || "",
    parking: currentPkg.hotelProfileLayer.hospitality.amenities[0] || "",
  };
  const activeCard = cards.find((card) => card.key === active) || null;

  function sendRequest() {
    if (!requestText.trim()) setRequestText(lang === "bg" ? "Допълнителна кърпа в стаята" : "Extra towel for the room");
    setRequestStatus("sent");
  }

  function detailContent(card: HubCard) {
    if (["reception", "housekeeping", "maintenance"].includes(card.key)) {
      return (
        <div className="space-y-4">
          <div className="p-4" style={{ backgroundColor: theme.soft, borderRadius: theme.cardRadius }}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: theme.primary }}>{copy.requestTitle}</p>
            <textarea
              value={requestText}
              onChange={(event) => setRequestText(event.target.value)}
              rows={3}
              placeholder={copy.requestBody}
              className="mt-3 w-full resize-none border p-3 text-sm outline-none"
              style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius, color: theme.text, fontFamily: theme.bodyFont }}
            />
            <button
              type="button"
              onClick={sendRequest}
              disabled={requestStatus === "sent" || requestStatus === "accepted"}
              className="mt-3 min-h-11 w-full px-4 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: theme.buttonText, borderRadius: theme.buttonRadius, fontFamily: theme.buttonFont }}
            >
              {copy.send}
            </button>
          </div>
          <div className="border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius }}>
            <p className="text-sm font-semibold">
              {requestStatus === "idle" ? copy.idle : requestStatus === "sent" ? copy.sent : requestStatus === "accepted" ? copy.accepted : copy.completed}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {["sent", "accepted", "completed"].map((step, index) => {
                const currentIndex = requestStatus === "idle" ? -1 : requestStatus === "sent" ? 0 : requestStatus === "accepted" ? 1 : 2;
                return <span key={step} className="h-2 flex-1" style={{ backgroundColor: index <= currentIndex ? theme.primary : theme.soft, borderRadius: theme.buttonRadius || "999px" }} />;
              })}
            </div>
          </div>
        </div>
      );
    }

    if (card.key === "info") {
      return (
        <div className="space-y-3">
          {info.checkIn ? <InfoRow label={copy.checkIn} value={info.checkIn} theme={theme} /> : null}
          {info.checkOut ? <InfoRow label={copy.checkOut} value={info.checkOut} theme={theme} /> : null}
          {info.parking ? <InfoRow label={copy.parking} value={info.parking} theme={theme} /> : null}
          {currentPkg.hotelProfileLayer.contacts.phones.map((phone) => <InfoRow key={phone} label={copy.phone} value={phone} theme={theme} />)}
          {currentPkg.hotelProfileLayer.contacts.emails.map((email) => <InfoRow key={email} label="Email" value={email} theme={theme} />)}
          {currentPkg.hotelProfileLayer.identity.address ? <InfoRow label={copy.address} value={currentPkg.hotelProfileLayer.identity.address} theme={theme} /> : null}
          <div className="border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius }}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: theme.primary }}>{copy.policies}</p>
            <p className="mt-2 text-sm leading-6" style={{ color: theme.text }}>
              {hasSources(currentPkg, "policies") ? copy.sourceOnly : copy.noData}
            </p>
          </div>
        </div>
      );
    }

    if (card.key === "gastronomy" || card.key === "wellness" || card.key === "extras") {
      const category = CATEGORY_FOR_CARD[card.key];
      const found = category ? hasSources(currentPkg, category) : false;
      return (
        <div className="space-y-3">
          <div className="p-4 text-sm leading-6" style={{ backgroundColor: theme.soft, color: theme.text, borderRadius: theme.cardRadius }}>
            {found ? copy.sourceOnly : copy.noData}
          </div>
          <div className="border border-dashed p-5 text-sm leading-6" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius, color: theme.muted }}>
            {copy.manual}
          </div>
        </div>
      );
    }

    if (card.key === "around") {
      const hasExperienceSources = hasSources(currentPkg, "experiences") || hasSources(currentPkg, "events");
      return (
        <div className="space-y-3">
          <div className="p-4 text-sm leading-6" style={{ backgroundColor: theme.soft, color: theme.text, borderRadius: theme.cardRadius }}>
            {hasExperienceSources ? copy.sourceOnly : copy.noData}
          </div>
          <div className="border border-dashed p-5 text-sm leading-6" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius, color: theme.muted }}>
            {copy.manual}
          </div>
        </div>
      );
    }

    if (card.key === "weather") {
      return <div className="border p-5 text-sm leading-6" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius, color: theme.text }}>Weather module · automatic hotel location data</div>;
    }

    if (card.key === "reviews") {
      return <div className="border border-dashed p-5 text-sm leading-6" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius, color: theme.muted }}>{copy.manual}</div>;
    }

    return <div className="border border-dashed p-5 text-sm leading-6" style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.cardRadius, color: theme.muted }}>{copy.manual}</div>;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eaf8f6_0%,#f8fbfb_48%,#eef8f7_100%)] px-3 py-5 text-[#174d50] sm:px-6">
      <div className="mx-auto max-w-[460px] overflow-hidden rounded-[2.2rem] border border-[#bae8e3] bg-[#f9fdfc] shadow-[0_24px_80px_rgba(29,83,84,0.16)]">
        <header className="bg-[linear-gradient(145deg,#174b4d,#43b5a1)] px-5 pb-6 pt-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">{copy.preview}</p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight">{hotelName}</h1>
            </div>
            <Link href={`/design-studio?lang=${lang}&preview=quick`} className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold">Design Studio</Link>
          </div>
          <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-white/70">{copy.demoRoom}</p>
                <p className="mt-1 text-sm font-semibold">{copy.roomConfirmed}</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#278d82]">✓</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/70">{copy.intro}</p>
        </header>

        <section className="p-4">
          <div className="grid grid-cols-3 gap-3">
            {cards.slice(0, 3).map((card) => (
              <HubTile key={card.key} card={card} onClick={() => setActive(card.key)} compact />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {cards.slice(3, 13).filter((card) => card.available).map((card) => (
              <HubTile key={card.key} card={card} onClick={() => setActive(card.key)} />
            ))}
          </div>

          <div className="mt-4">
            <HubTile card={cards[cards.length - 1]} onClick={() => setActive("emergency")} wide />
          </div>
        </section>

        <nav className="sticky bottom-0 grid grid-cols-4 border-t border-[#d5ebe8] bg-white/95 px-2 py-2 backdrop-blur">
          {[copy.home, copy.services, copy.hotel, copy.more].map((label, index) => (
            <button key={label} type="button" onClick={() => setActive(index === 0 ? null : index === 1 ? "extras" : index === 2 ? "info" : "around")} className="min-h-12 rounded-xl text-[11px] font-semibold text-[#5b7b7d] hover:bg-[#edf8f6]">{label}</button>
          ))}
        </nav>
      </div>

      {activeCard ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#123f42]/35 p-3 sm:items-center">
          <div className="max-h-[84vh] w-full max-w-[440px] overflow-y-auto rounded-[2rem] border border-[#c6e7e3] bg-[#f9fdfc] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${activeCard.danger ? "bg-rose-50 text-rose-500" : "bg-[#e8f8f5] text-[#3da99b]"}`}><Icon name={activeCard.icon} /></span>
                <div>
                  <h2 className="text-xl font-bold text-[#16484b]">{activeCard.title}</h2>
                  {activeCard.manual ? <p className="mt-1 text-xs text-slate-400">{copy.manual}</p> : null}
                </div>
              </div>
              <button type="button" onClick={() => setActive(null)} aria-label={copy.close} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#cfe8e5] bg-white text-xl">×</button>
            </div>
            <div className="mt-5">{detailContent(activeCard)}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function HubTile({ card, onClick, compact = false, wide = false }: { card: HubCard; onClick: () => void; compact?: boolean; wide?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`group relative overflow-hidden rounded-[1.7rem] border bg-white text-left shadow-[0_10px_30px_rgba(58,119,117,0.07)] transition hover:-translate-y-0.5 hover:shadow-lg ${card.danger ? "border-rose-200" : "border-[#ccebe7]"} ${wide ? "w-full" : ""} ${compact ? "min-h-36 p-3" : "min-h-40 p-4"}`}>
      <div className={`${card.danger ? "text-rose-500" : "text-[#43b5a1]"}`}><Icon name={card.icon} /></div>
      <p className={`mt-5 font-semibold leading-tight ${compact ? "text-[13px]" : "text-sm"} ${card.danger ? "text-rose-600" : "text-[#315d60]"}`}>{card.title}</p>
      {card.manual ? <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-amber-300" title="Manual onboarding" /> : null}
      <div className={`absolute inset-x-0 bottom-0 h-5 ${card.danger ? "bg-rose-50" : "bg-[radial-gradient(ellipse_at_top,#c9f2ec_0%,#eafaf7_58%,transparent_60%)]"}`} />
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#d9ece9] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4ca79d]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[#365f61]">{value}</p>
    </div>
  );
}
