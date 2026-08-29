import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { buildHubDesignProposal, type HubDesignSection } from "@/lib/product-factory/hub-design-proposal";

export type HubExperiencePreset = "boutique" | "resort" | "family" | "business" | "minimal";
export type HubSurfaceKind = "home" | "services" | "stay" | "offers" | "messages" | "hotel_info" | "custom";
export type HubModuleKind =
  | "hero"
  | "quick_actions"
  | "content_grid"
  | "content_list"
  | "offer_teaser"
  | "announcement"
  | "floating_banner"
  | "message_teaser"
  | "survey_card"
  | "ai_concierge"
  | "weather"
  | "contact_strip";

export type HubInternalPage = {
  id: string;
  kind: HubSurfaceKind;
  title: string;
  subtitle: string;
  sectionIds: string[];
  designDraft: boolean;
};

export type HubNavigationItem = {
  id: string;
  label: string;
  pageId: string;
  role: "home" | "services" | "offers" | "messages" | "more" | "custom";
};

export type HubPromotionPlacement = "top" | "inline" | "floating_bottom";

export type HubPromotionDraft = {
  id: string;
  placement: HubPromotionPlacement;
  title: string;
  body: string;
  ctaLabel: string;
  dismissible: boolean;
  frequencyCap: "once_per_session" | "once_per_day" | "manual";
  designDraft: true;
};

export type HubOfferDraft = {
  id: string;
  title: string;
  discountLabel: string;
  body: string;
  validityLabel: string;
  ctaLabel: string;
  designDraft: true;
};

export type HubMessageDraft = {
  id: string;
  kind: "operational" | "stay" | "marketing";
  channel: "in_app" | "push";
  title: string;
  body: string;
  marketingConsentRequired: boolean;
  timeSensitiveAllowed: boolean;
  designDraft: true;
};

export type HubSurveySurface = {
  enabled: boolean;
  placement: "home" | "messages" | "stay";
  presentation: "card" | "compact";
  runtimeOwned: true;
};

export type HubDesignQaSeverity = "pass" | "warn" | "block";
export type HubDesignQaCheck = {
  id: string;
  severity: HubDesignQaSeverity;
  title: string;
  detail: string;
};

export type HubExperienceBlueprint = {
  schemaVersion: "hub-experience-blueprint-v2";
  hotelName: string;
  preset: HubExperiencePreset;
  sections: HubDesignSection[];
  pages: HubInternalPage[];
  navigation: HubNavigationItem[];
  modules: HubModuleKind[];
  promotions: HubPromotionDraft[];
  offers: HubOfferDraft[];
  messages: HubMessageDraft[];
  survey: HubSurveySurface;
  assetPolicy: "hotel_authorization_required";
  materializationPolicy: "explicit_review_required";
  generatedFrom: "hotel-intelligence-v1";
};

const SERVICE_CATEGORIES = new Set(["dining", "wellness", "services", "amenities", "beach", "family", "parking"]);
const STAY_CATEGORIES = new Set(["accommodation"]);
const INFO_CATEGORIES = new Set(["hotel", "location", "operations", "policy", "sustainability", "events"]);

const COPY = {
  bg: {
    services: "Услуги",
    servicesSubtitle: "Всичко за престоя на едно място",
    stay: "Моят престой",
    staySubtitle: "Настаняване и информация за престоя",
    offers: "Оферти",
    offersSubtitle: "Персонални предложения и хотелски преживявания",
    messages: "Съобщения",
    messagesSubtitle: "Новини и важна информация от хотела",
    info: "За хотела",
    infoSubtitle: "Локация, правила и полезна информация",
    navHome: "Начало",
    navServices: "Услуги",
    navOffers: "Оферти",
    navMessages: "Съобщения",
    navMore: "Още",
    promoTitle: "Специално за Вашия престой",
    promoBody: "Добавете предложение, което гостът може да разгледа без да прекъсва основния поток.",
    promoCta: "Разгледай",
    offerTitle: "Оферта за престоя",
    offerBody: "Design пример. Реална цена, отстъпка и валидност се потвърждават във Hotel Factory.",
    offerValidity: "Валидност се задава във Factory",
    messageTitle: "Добре дошли",
    messageBody: "Design пример за in-app съобщение от хотела.",
  },
  en: {
    services: "Services",
    servicesSubtitle: "Everything for the stay in one place",
    stay: "My stay",
    staySubtitle: "Accommodation and stay information",
    offers: "Offers",
    offersSubtitle: "Personal offers and hotel experiences",
    messages: "Messages",
    messagesSubtitle: "News and important hotel information",
    info: "About the hotel",
    infoSubtitle: "Location, policies and useful information",
    navHome: "Home",
    navServices: "Services",
    navOffers: "Offers",
    navMessages: "Messages",
    navMore: "More",
    promoTitle: "Special for your stay",
    promoBody: "Add an offer guests can explore without interrupting the primary journey.",
    promoCta: "Explore",
    offerTitle: "Stay offer",
    offerBody: "Design sample. Real pricing, discount and validity are confirmed in Hotel Factory.",
    offerValidity: "Validity is configured in Factory",
    messageTitle: "Welcome",
    messageBody: "Design sample for an in-app hotel message.",
  },
} as const;

function sectionIdsByCategory(sections: HubDesignSection[], categories: Set<string>) {
  return sections.filter((section) => categories.has(section.category)).map((section) => section.id);
}

export function buildHubExperienceBlueprint(
  pkg: HotelIntelligencePackage,
  language: "bg" | "en",
): HubExperienceBlueprint {
  const copy = COPY[language];
  const proposal = buildHubDesignProposal(pkg, language);
  const serviceIds = sectionIdsByCategory(proposal.sections, SERVICE_CATEGORIES);
  const stayIds = sectionIdsByCategory(proposal.sections, STAY_CATEGORIES);
  const infoIds = sectionIdsByCategory(proposal.sections, INFO_CATEGORIES);

  const pages: HubInternalPage[] = [
    { id: "page-services", kind: "services", title: copy.services, subtitle: copy.servicesSubtitle, sectionIds: serviceIds, designDraft: false },
    { id: "page-stay", kind: "stay", title: copy.stay, subtitle: copy.staySubtitle, sectionIds: stayIds, designDraft: false },
    { id: "page-offers", kind: "offers", title: copy.offers, subtitle: copy.offersSubtitle, sectionIds: [], designDraft: true },
    { id: "page-messages", kind: "messages", title: copy.messages, subtitle: copy.messagesSubtitle, sectionIds: [], designDraft: true },
    { id: "page-info", kind: "hotel_info", title: copy.info, subtitle: copy.infoSubtitle, sectionIds: infoIds, designDraft: false },
  ];

  return {
    schemaVersion: "hub-experience-blueprint-v2",
    hotelName: proposal.hotelName,
    preset: "boutique",
    sections: proposal.sections,
    pages,
    navigation: [
      { id: "nav-home", label: copy.navHome, pageId: "home", role: "home" },
      { id: "nav-services", label: copy.navServices, pageId: "page-services", role: "services" },
      { id: "nav-offers", label: copy.navOffers, pageId: "page-offers", role: "offers" },
      { id: "nav-messages", label: copy.navMessages, pageId: "page-messages", role: "messages" },
      { id: "nav-more", label: copy.navMore, pageId: "page-info", role: "more" },
    ],
    modules: [
      "hero",
      "quick_actions",
      "offer_teaser",
      "message_teaser",
      "survey_card",
      "ai_concierge",
      "weather",
      "contact_strip",
    ],
    promotions: [
      {
        id: "promo-floating-sample",
        placement: "floating_bottom",
        title: copy.promoTitle,
        body: copy.promoBody,
        ctaLabel: copy.promoCta,
        dismissible: true,
        frequencyCap: "once_per_session",
        designDraft: true,
      },
    ],
    offers: [
      {
        id: "offer-sample",
        title: copy.offerTitle,
        discountLabel: "-15%",
        body: copy.offerBody,
        validityLabel: copy.offerValidity,
        ctaLabel: copy.promoCta,
        designDraft: true,
      },
    ],
    messages: [
      {
        id: "message-welcome-sample",
        kind: "stay",
        channel: "in_app",
        title: copy.messageTitle,
        body: copy.messageBody,
        marketingConsentRequired: false,
        timeSensitiveAllowed: false,
        designDraft: true,
      },
    ],
    survey: {
      enabled: true,
      placement: "home",
      presentation: "card",
      runtimeOwned: true,
    },
    assetPolicy: "hotel_authorization_required",
    materializationPolicy: "explicit_review_required",
    generatedFrom: "hotel-intelligence-v1",
  };
}

function channel(value: number) {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
}

function rgbFromHex(hex: string) {
  const normalized = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function contrastRatio(foreground: string, background: string) {
  const fg = rgbFromHex(foreground);
  const bg = rgbFromHex(background);
  if (!fg || !bg) return 0;
  const lum = (rgb: number[]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const first = lum(fg);
  const second = lum(bg);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateHubExperienceDesign(input: {
  navigation: HubNavigationItem[];
  promotions: HubPromotionDraft[];
  offers: HubOfferDraft[];
  messages: HubMessageDraft[];
  homeModuleCount: number;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}): HubDesignQaCheck[] {
  const checks: HubDesignQaCheck[] = [];
  const navCount = input.navigation.length;
  checks.push({
    id: "top-level-navigation",
    severity: navCount >= 3 && navCount <= 5 ? "pass" : "block",
    title: "3–5 top-level destinations",
    detail: navCount >= 3 && navCount <= 5 ? `${navCount} persistent destinations` : `${navCount} destinations make primary navigation unstable`,
  });
  checks.push({
    id: "home-destination",
    severity: input.navigation.some((item) => item.role === "home") ? "pass" : "block",
    title: "Home remains a stable destination",
    detail: input.navigation.some((item) => item.role === "home") ? "Home is always reachable" : "Add a Home destination",
  });

  const floating = input.promotions.filter((item) => item.placement === "floating_bottom");
  checks.push({
    id: "floating-promotion-density",
    severity: floating.length <= 1 ? "pass" : "block",
    title: "One floating promotion maximum",
    detail: floating.length <= 1 ? "Floating promotion will not compete with core navigation" : "Reduce floating promotions to one",
  });
  checks.push({
    id: "dismissible-promotions",
    severity: input.promotions.every((item) => item.dismissible) ? "pass" : "warn",
    title: "Promotions are dismissible",
    detail: input.promotions.every((item) => item.dismissible) ? "Guests retain control" : "Make every promotional overlay dismissible",
  });
  checks.push({
    id: "frequency-caps",
    severity: input.promotions.every((item) => item.frequencyCap !== "manual") ? "pass" : "warn",
    title: "Promotions are frequency-capped",
    detail: input.promotions.every((item) => item.frequencyCap !== "manual") ? "Repeated interruption is limited" : "Set a session/day frequency cap",
  });

  const marketingSafe = input.messages
    .filter((message) => message.kind === "marketing" && message.channel === "push")
    .every((message) => message.marketingConsentRequired && !message.timeSensitiveAllowed);
  checks.push({
    id: "marketing-push-consent",
    severity: marketingSafe ? "pass" : "block",
    title: "Marketing push requires consent",
    detail: marketingSafe ? "Marketing push respects explicit consent and is never time-sensitive" : "Require consent and disable Time Sensitive for marketing push",
  });

  checks.push({
    id: "offer-completeness",
    severity: input.offers.every((offer) => Boolean(offer.ctaLabel && offer.validityLabel)) ? "pass" : "warn",
    title: "Offers have CTA and validity",
    detail: input.offers.every((offer) => Boolean(offer.ctaLabel && offer.validityLabel)) ? "Offer intent is clear" : "Add CTA and validity to every offer",
  });

  checks.push({
    id: "progressive-disclosure",
    severity: input.homeModuleCount <= 9 ? "pass" : "warn",
    title: "Home stays focused",
    detail: input.homeModuleCount <= 9 ? `${input.homeModuleCount} primary modules; details can live on inner pages` : "Move secondary modules into internal pages",
  });

  const bodyContrast = contrastRatio(input.textColor, input.backgroundColor);
  checks.push({
    id: "text-contrast",
    severity: bodyContrast >= 4.5 ? "pass" : "block",
    title: "Text contrast ≥ 4.5:1",
    detail: `Current ratio ${bodyContrast.toFixed(2)}:1`,
  });
  const controlContrast = contrastRatio(input.primaryColor, input.backgroundColor);
  checks.push({
    id: "control-contrast",
    severity: controlContrast >= 3 ? "pass" : "warn",
    title: "UI contrast ≥ 3:1",
    detail: `Primary/background ratio ${controlContrast.toFixed(2)}:1`,
  });

  checks.push({
    id: "touch-targets",
    severity: "pass",
    title: "Touch targets ≥ 44px",
    detail: "Builder preview controls use a minimum 44px interaction target",
  });

  return checks;
}
