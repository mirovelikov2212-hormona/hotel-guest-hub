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
  dining: 10,
  wellness: 20,
  beach: 30,
  family: 40,
  services: 50,
  amenities: 60,
  accommodation: 70,
  events: 80,
  operations: 90,
  policy: 100,
  location: 110,
  hotel: 120,
  sustainability: 130,
  parking: 140,
};

const CATEGORY_TITLES: Record<string, { bg: string; en: string }> = {
  dining: { bg: "Хранене и напитки", en: "Dining & drinks" },
  wellness: { bg: "СПА и уелнес", en: "SPA & wellness" },
  beach: { bg: "Плаж", en: "Beach" },
  family: { bg: "За семейства", en: "For families" },
  services: { bg: "Услуги", en: "Services" },
  amenities: { bg: "Удобства", en: "Amenities" },
  accommodation: { bg: "Настаняване", en: "Accommodation" },
  events: { bg: "Събития", en: "Events" },
  operations: { bg: "Полезна информация", en: "Useful information" },
  policy: { bg: "Правила и условия", en: "Policies" },
  location: { bg: "Локация", en: "Location" },
  hotel: { bg: "За хотела", en: "About the hotel" },
  sustainability: { bg: "Устойчивост", en: "Sustainability" },
  parking: { bg: "Паркинг", en: "Parking" },
};

function normalizeHex(value: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9A-F]{3}$/.test(raw)) {
    return `#${raw.slice(1).split("").map((part) => `${part}${part}`).join("")}`;
  }
  return "";
}

function rgb(hex: string) {
  const value = normalizeHex(hex);
  if (!value) return null;
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function luminance(hex: string) {
  const color = rgb(hex);
  if (!color) return 0.5;
  const channels = [color.r, color.g, color.b].map((value) => {
    const part = value / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function saturationSpread(hex: string) {
  const color = rgb(hex);
  if (!color) return 0;
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function isUsefulBrandColor(hex: string) {
  const lum = luminance(hex);
  return saturationSpread(hex) >= 24 && lum > 0.025 && lum < 0.94;
}

function mixWithWhite(hex: string, whiteWeight = 0.86) {
  const color = rgb(hex);
  if (!color) return "#F2F7F6";
  const mix = (value: number) => Math.round(value * (1 - whiteWeight) + 255 * whiteWeight)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `#${mix(color.r)}${mix(color.g)}${mix(color.b)}`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function isContentFont(font: string) {
  const value = String(font || "").trim();
  return Boolean(value) && !ICON_FONT_PATTERN.test(value);
}

export function selectHubTypography(fonts: string[]) {
  const contentFonts = unique(fonts.map((font) => String(font || "").trim()).filter(isContentFont));
  const headingFont = contentFonts.find((font) => DISPLAY_FONT_PATTERN.test(font)) || contentFonts[0] || FALLBACK_FONT;
  const bodyFont = contentFonts.find((font) => font !== headingFont && !DISPLAY_FONT_PATTERN.test(font))
    || contentFonts.find((font) => font !== headingFont)
    || contentFonts[0]
    || FALLBACK_FONT;
  return { headingFont, bodyFont, contentFonts };
}

function selectTheme(colors: string[], fonts: string[]): HubDesignTheme & { availableColors: string[]; availableFonts: string[] } {
  const normalizedColors = unique(colors.map(normalizeHex).filter(Boolean));
  const brandColors = normalizedColors.filter(isUsefulBrandColor);
  const darkColors = normalizedColors.filter((color) => luminance(color) < 0.22);
  const lightColors = normalizedColors.filter((color) => luminance(color) > 0.82);
  const primaryColor = brandColors[0] || FALLBACK_PRIMARY;
  const secondaryColor = brandColors.find((color) => color !== primaryColor && luminance(color) < luminance(primaryColor))
    || darkColors[0]
    || FALLBACK_SECONDARY;
  const backgroundColor = lightColors.find((color) => color !== "#FFFFFF") || FALLBACK_BACKGROUND;
  const surfaceColor = lightColors.includes("#FFFFFF") ? "#FFFFFF" : FALLBACK_SURFACE;
  const textColor = darkColors[0] || FALLBACK_TEXT;
  const typography = selectHubTypography(fonts);

  return {
    primaryColor,
    secondaryColor,
    backgroundColor,
    surfaceColor,
    textColor,
    softAccentColor: mixWithWhite(primaryColor),
    headingFont: typography.headingFont,
    bodyFont: typography.bodyFont,
    availableColors: normalizedColors.length ? normalizedColors : [FALLBACK_PRIMARY, FALLBACK_SECONDARY, FALLBACK_BACKGROUND, FALLBACK_SURFACE],
    availableFonts: typography.contentFonts.length ? typography.contentFonts : [FALLBACK_FONT],
  };
}

function categoryTitle(category: string, language: "bg" | "en") {
  return CATEGORY_TITLES[category]?.[language] || category;
}

function buildSections(items: HotelIntelligenceItem[], language: "bg" | "en") {
  const grouped = new Map<string, HotelIntelligenceItem[]>();
  for (const item of items) {
    const category = String(item.category || "hotel").trim().toLowerCase() || "hotel";
    const current = grouped.get(category) || [];
    current.push(item);
    grouped.set(category, current);
  }

  return [...grouped.entries()]
    .map(([category, facts]) => ({
      id: `section-${category}`,
      category,
      title: categoryTitle(category, language),
      priority: CATEGORY_PRIORITY[category] ?? 500,
      items: facts.slice(0, 8).map((fact) => ({
        id: fact.id,
        label: fact.label,
        value: fact.value,
        confidence: fact.confidence,
      })),
    }))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}

export function buildHubDesignProposal(
  pkg: HotelIntelligencePackage,
  language: "bg" | "en",
): HubDesignProposal {
  const selected = selectTheme(pkg.designIntelligenceLayer.colors, pkg.designIntelligenceLayer.fonts);
  const sections = buildSections(pkg.routing.hub, language);

  return {
    schemaVersion: "hub-design-proposal-v1",
    hotelName: pkg.hotelProfileLayer.identity.hotelName || "Hotel",
    theme: {
      primaryColor: selected.primaryColor,
      secondaryColor: selected.secondaryColor,
      backgroundColor: selected.backgroundColor,
      surfaceColor: selected.surfaceColor,
      textColor: selected.textColor,
      softAccentColor: selected.softAccentColor,
      headingFont: selected.headingFont,
      bodyFont: selected.bodyFont,
    },
    availableColors: selected.availableColors,
    availableFonts: selected.availableFonts,
    sections,
    quickActions: sections.slice(0, 6).map((section) => section.id),
    assetPolicy: "hotel_authorization_required",
    generatedFrom: "hotel-intelligence-v1",
  };
}
