import { buildHotelScannerHubSections } from "@/lib/ai/hotel-scanner-hub-sections.mjs";
import type { HotelIntelligenceItem, HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

export type HubDesignTheme = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  softAccentColor: string;
  headingFont: string;
  bodyFont: string;
};

export type HubDesignSection = {
  id: string;
  category: string;
  title: string;
  items: Array<Pick<HotelIntelligenceItem, "id" | "label" | "value" | "confidence">>;
  priority: number;
};

export type HubDesignProposal = {
  schemaVersion: "hub-design-proposal-v1";
  hotelName: string;
  theme: HubDesignTheme;
  availableColors: string[];
  availableFonts: string[];
  sections: HubDesignSection[];
  quickActions: string[];
  assetPolicy: "hotel_authorization_required";
  generatedFrom: "hotel-intelligence-v1";
};

const FALLBACK_PRIMARY = "#43B5A1";
const FALLBACK_SECONDARY = "#202627";
const FALLBACK_BACKGROUND = "#F7F7F5";
const FALLBACK_SURFACE = "#FFFFFF";
const FALLBACK_TEXT = "#202124";
const FALLBACK_FONT = "system-ui";

const ICON_FONT_PATTERN = /(font\s*awesome|eleganticons?|ionicons?|linearicons?|linea[-\s_]|glyphicons?|material\s*icons?|icomoon|flaticon|themify|et-line|simple-line-icons?)/i;
const DISPLAY_FONT_PATTERN = /(garamond|serif|display|playfair|baskerville|bodoni|didot|cinzel|cormorant|libre|merriweather|lora)/i;

const CATEGORY_PRIORITY: Record<string, number> = {
  overview: 5,
  dining: 10,
  wellness: 20,
  services: 30,
  experiences: 40,
  offers: 45,
  accommodation: 50,
  events: 60,
  policies: 90,
};

const CATEGORY_TITLES: Record<string, { bg: string; en: string }> = {
  overview: { bg: "Най-важното за хотела", en: "Hotel essentials" },
  accommodation: { bg: "Настаняване", en: "Accommodation" },
  dining: { bg: "Ресторанти и барове", en: "Restaurants & bars" },
  wellness: { bg: "СПА, уелнес и medical", en: "SPA, wellness & medical" },
  services: { bg: "Услуги и удобства", en: "Services & amenities" },
  experiences: { bg: "Преживявания и активности", en: "Experiences & activities" },
  events: { bg: "Събития", en: "Events" },
  offers: { bg: "Оферти и резервируеми услуги", en: "Offers & bookable services" },
  policies: { bg: "Политики · кратко", en: "Policies · summary" },
};

const ATTRIBUTE_LABELS: Record<string, { bg: string; en: string }> = {
  description: { bg: "Описание", en: "Description" }, capacity: { bg: "Капацитет", en: "Capacity" }, size: { bg: "Площ", en: "Size" },
  price: { bg: "Цена", en: "Price" }, meal_inclusion: { bg: "Хранене", en: "Meal plan" }, hours: { bg: "Работно време", en: "Hours" },
  booking: { bg: "Резервация", en: "Booking" }, external_access: { bg: "Достъп", en: "Access" }, session_duration: { bg: "Продължителност", en: "Duration" },
  event_capacity: { bg: "Капацитет", en: "Capacity" }, event_service: { bg: "Възможности", en: "Capabilities" }, check_in: { bg: "Настаняване", en: "Check-in" },
  check_out: { bg: "Освобождаване", en: "Check-out" }, quiet_hours: { bg: "Тихи часове", en: "Quiet hours" }, pet_policy: { bg: "Домашни любимци", en: "Pets" },
  smoking_policy: { bg: "Пушене", en: "Smoking" }, parking: { bg: "Паркинг", en: "Parking" }, wifi: { bg: "Wi‑Fi", en: "Wi‑Fi" },
};

function normalizeHex(value: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9A-F]{3}$/.test(raw)) return `#${raw.slice(1).split("").map((part) => `${part}${part}`).join("")}`;
  return "";
}
function rgb(hex: string) { const value = normalizeHex(hex); if (!value) return null; return { r: Number.parseInt(value.slice(1, 3), 16), g: Number.parseInt(value.slice(3, 5), 16), b: Number.parseInt(value.slice(5, 7), 16) }; }
function luminance(hex: string) { const color = rgb(hex); if (!color) return 0.5; const channels = [color.r, color.g, color.b].map((value) => { const part = value / 255; return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4; }); return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]; }
function saturationSpread(hex: string) { const color = rgb(hex); return color ? Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) : 0; }
function isUsefulBrandColor(hex: string) { const lum = luminance(hex); return saturationSpread(hex) >= 24 && lum > 0.025 && lum < 0.94; }
function mixWithWhite(hex: string, whiteWeight = 0.86) { const color = rgb(hex); if (!color) return "#F2F7F6"; const mix = (value: number) => Math.round(value * (1 - whiteWeight) + 255 * whiteWeight).toString(16).padStart(2, "0").toUpperCase(); return `#${mix(color.r)}${mix(color.g)}${mix(color.b)}`; }
function unique<T>(values: T[]) { return [...new Set(values)]; }

export function isContentFont(font: string) { const value = String(font || "").trim(); return Boolean(value) && !ICON_FONT_PATTERN.test(value); }
export function selectHubTypography(fonts: string[]) { const contentFonts = unique(fonts.map((font) => String(font || "").trim()).filter(isContentFont)); const headingFont = contentFonts.find((font) => DISPLAY_FONT_PATTERN.test(font)) || contentFonts[0] || FALLBACK_FONT; const bodyFont = contentFonts.find((font) => font !== headingFont && !DISPLAY_FONT_PATTERN.test(font)) || contentFonts.find((font) => font !== headingFont) || contentFonts[0] || FALLBACK_FONT; return { headingFont, bodyFont, contentFonts }; }
function selectTheme(colors: string[], fonts: string[]): HubDesignTheme & { availableColors: string[]; availableFonts: string[] } {
  const normalizedColors = unique(colors.map(normalizeHex).filter(Boolean)); const brandColors = normalizedColors.filter(isUsefulBrandColor); const darkColors = normalizedColors.filter((color) => luminance(color) < 0.22); const lightColors = normalizedColors.filter((color) => luminance(color) > 0.82); const primaryColor = brandColors[0] || FALLBACK_PRIMARY; const secondaryColor = brandColors.find((color) => color !== primaryColor && luminance(color) < luminance(primaryColor)) || darkColors[0] || FALLBACK_SECONDARY; const backgroundColor = lightColors.find((color) => color !== "#FFFFFF") || FALLBACK_BACKGROUND; const surfaceColor = lightColors.includes("#FFFFFF") ? "#FFFFFF" : FALLBACK_SURFACE; const textColor = darkColors[0] || FALLBACK_TEXT; const typography = selectHubTypography(fonts);
  return { primaryColor, secondaryColor, backgroundColor, surfaceColor, textColor, softAccentColor: mixWithWhite(primaryColor), headingFont: typography.headingFont, bodyFont: typography.bodyFont, availableColors: normalizedColors.length ? normalizedColors : [FALLBACK_PRIMARY, FALLBACK_SECONDARY, FALLBACK_BACKGROUND, FALLBACK_SURFACE], availableFonts: typography.contentFonts.length ? typography.contentFonts : [FALLBACK_FONT] };
}

function categoryTitle(category: string, language: "bg" | "en") { return CATEGORY_TITLES[category]?.[language] || category; }
function attrLabel(attribute: string, fallback: string, language: "bg" | "en") { return ATTRIBUTE_LABELS[attribute]?.[language] || fallback || attribute; }
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }

function compactItemValue(facts: HotelIntelligenceItem[], language: "bg" | "en", limit = 5) {
  const preferred = ["description", "capacity", "size", "price", "meal_inclusion", "hours", "booking", "external_access", "session_duration", "event_capacity", "event_service", "check_in", "check_out", "quiet_hours", "parking", "wifi"];
  const ranked = [...facts].sort((a, b) => {
    const ai = preferred.indexOf(clean(a.attribute)); const bi = preferred.indexOf(clean(b.attribute));
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const fact of ranked) {
    const value = clean(fact.value); if (!value) continue;
    const key = `${clean(fact.attribute)}|${value.toLowerCase()}`; if (seen.has(key)) continue; seen.add(key);
    parts.push(`${attrLabel(clean(fact.attribute), fact.label, language)}: ${value}`);
    if (parts.length >= limit) break;
  }
  return parts.join(" · ");
}

function buildSections(items: HotelIntelligenceItem[], language: "bg" | "en") {
  const grouped = buildHotelScannerHubSections(items) as Array<{ key: string; items: Array<{ key: string; name: string; facts: HotelIntelligenceItem[] }> }>;
  return grouped
    .filter((section) => section.key !== "contacts")
    .map((section) => {
      const maxItems = section.key === "policies" ? 1 : 12;
      const rows = section.items.slice(0, maxItems).flatMap((item, index) => {
        if (section.key === "overview" && !item.name) {
          return item.facts.slice(0, 6).map((fact, factIndex) => ({ id: `hub-${section.key}-${index}-${factIndex}`, label: fact.label, value: fact.value, confidence: fact.confidence }));
        }
        const value = compactItemValue(item.facts, language, section.key === "policies" ? 4 : 5);
        if (!value) return [];
        return [{ id: `hub-${section.key}-${index}`, label: item.name || categoryTitle(section.key, language), value, confidence: Math.max(...item.facts.map((fact) => Number(fact.confidence || 0))) }];
      });
      return { id: `section-${section.key}`, category: section.key, title: categoryTitle(section.key, language), priority: CATEGORY_PRIORITY[section.key] ?? 500, items: rows };
    })
    .filter((section) => section.items.length > 0)
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}

export function buildHubDesignProposal(pkg: HotelIntelligencePackage, language: "bg" | "en"): HubDesignProposal {
  const selected = selectTheme(pkg.designIntelligenceLayer.colors, pkg.designIntelligenceLayer.fonts);
  const sections = buildSections(pkg.routing.hub, language);
  return {
    schemaVersion: "hub-design-proposal-v1",
    hotelName: pkg.hotelProfileLayer.identity.hotelName || "Hotel",
    theme: { primaryColor: selected.primaryColor, secondaryColor: selected.secondaryColor, backgroundColor: selected.backgroundColor, surfaceColor: selected.surfaceColor, textColor: selected.textColor, softAccentColor: selected.softAccentColor, headingFont: selected.headingFont, bodyFont: selected.bodyFont },
    availableColors: selected.availableColors,
    availableFonts: selected.availableFonts,
    sections,
    quickActions: sections.filter((section) => !["overview", "policies"].includes(section.category)).slice(0, 6).map((section) => section.id),
    assetPolicy: "hotel_authorization_required",
    generatedFrom: "hotel-intelligence-v1",
  };
}
