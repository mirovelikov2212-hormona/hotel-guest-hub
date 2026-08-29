import type { HubDesignSection } from "@/lib/product-factory/hub-design-proposal";
import type {
  HubExperienceBlueprint,
  HubExperiencePreset,
  HubInternalPage,
  HubMessageDraft,
  HubModuleKind,
  HubNavigationItem,
  HubOfferDraft,
  HubPromotionDraft,
  HubSurveySurface,
} from "@/lib/product-factory/hub-experience-blueprint";

export const HUB_DESIGN_DRAFT_SCHEMA_VERSION = "hub-experience-design-draft-v1" as const;

export type HubDesignDraftTheme = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  headingFont: string;
  bodyFont: string;
};

export type HubDesignDraftAuthoringState = {
  preset: HubExperiencePreset;
  theme: HubDesignDraftTheme;
  modules: HubModuleKind[];
  hiddenSectionIds: string[];
  manualSections: HubDesignSection[];
  extraItems: Record<string, HubDesignSection["items"]>;
  pages: HubInternalPage[];
  navigation: HubNavigationItem[];
  offers: HubOfferDraft[];
  messages: HubMessageDraft[];
  promotions: HubPromotionDraft[];
  promotionEnabled: boolean;
  searchEnabled: boolean;
  survey: HubSurveySurface;
};

export type HubDesignDraftPayload = {
  schemaVersion: typeof HUB_DESIGN_DRAFT_SCHEMA_VERSION;
  source: {
    canonicalUrl: string;
    hotelName: string;
    packageSchemaVersion: "hotel-intelligence-v1";
  };
  authoring: HubDesignDraftAuthoringState;
  experience: HubExperienceBlueprint;
  policies: {
    assetPolicy: "hotel_authorization_required";
    materializationPolicy: "explicit_review_required";
    runtimeCampaignSend: false;
    liveActivation: false;
  };
};

export type HubDesignDraftValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type HubDesignDraftDiff = {
  changedPaths: string[];
  changeCount: number;
  truncated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function canonicalizeDesignDraftJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeDesignDraftJson);
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const child = value[key];
        if (child !== undefined) result[key] = canonicalizeDesignDraftJson(child);
        return result;
      }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function stableDesignDraftStringify(value: unknown) {
  return JSON.stringify(canonicalizeDesignDraftJson(value));
}

export function normalizeCanonicalHotelSourceUrl(rawUrl: string) {
  const url = new URL(String(rawUrl || "").trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("HUB_DESIGN_SOURCE_URL_INVALID");
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function uniqueNonEmpty(values: string[]) {
  return values.length === new Set(values).size && values.every((value) => Boolean(String(value || "").trim()));
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}

export function validateHubDesignDraftPayload(value: unknown): HubDesignDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["DRAFT_NOT_OBJECT"], warnings };
  if (value.schemaVersion !== HUB_DESIGN_DRAFT_SCHEMA_VERSION) errors.push("SCHEMA_VERSION_UNSUPPORTED");

  const source = isRecord(value.source) ? value.source : null;
  if (!source) {
    errors.push("SOURCE_REQUIRED");
  } else {
    try {
      normalizeCanonicalHotelSourceUrl(String(source.canonicalUrl || ""));
    } catch {
      errors.push("SOURCE_CANONICAL_URL_INVALID");
    }
    if (!String(source.hotelName || "").trim()) errors.push("SOURCE_HOTEL_NAME_REQUIRED");
    if (source.packageSchemaVersion !== "hotel-intelligence-v1") errors.push("SOURCE_PACKAGE_VERSION_UNSUPPORTED");
  }

  const authoring = isRecord(value.authoring) ? value.authoring : null;
  if (!authoring) {
    errors.push("AUTHORING_STATE_REQUIRED");
  } else {
    const theme = isRecord(authoring.theme) ? authoring.theme : null;
    if (!theme) {
      errors.push("THEME_REQUIRED");
    } else {
      for (const key of ["primaryColor", "secondaryColor", "backgroundColor"] as const) {
        if (!isHexColor(String(theme[key] || ""))) errors.push(`THEME_${key.toUpperCase()}_INVALID`);
      }
      if (!String(theme.headingFont || "").trim()) errors.push("HEADING_FONT_REQUIRED");
      if (!String(theme.bodyFont || "").trim()) errors.push("BODY_FONT_REQUIRED");
    }

    const pages = Array.isArray(authoring.pages) ? authoring.pages : [];
    const navigation = Array.isArray(authoring.navigation) ? authoring.navigation : [];
    const modules = Array.isArray(authoring.modules) ? authoring.modules : [];
    const hidden = Array.isArray(authoring.hiddenSectionIds) ? authoring.hiddenSectionIds : [];
    if (!uniqueNonEmpty(pages.map((page) => isRecord(page) ? String(page.id || "") : ""))) errors.push("PAGE_IDS_INVALID");
    if (!uniqueNonEmpty(navigation.map((item) => isRecord(item) ? String(item.id || "") : ""))) errors.push("NAVIGATION_IDS_INVALID");
    if (!uniqueNonEmpty(modules.map(String))) errors.push("MODULES_INVALID");
    if (!uniqueNonEmpty(hidden.map(String))) errors.push("HIDDEN_SECTION_IDS_INVALID");
    if (!navigation.some((item) => isRecord(item) && item.role === "home" && item.pageId === "home")) errors.push("HOME_NAVIGATION_REQUIRED");
    if (navigation.length < 3 || navigation.length > 5) warnings.push("NAVIGATION_RECOMMENDED_3_TO_5");
    if (modules.length > 10) warnings.push("HOME_MODULE_COUNT_HIGH");
    if (authoring.promotionEnabled && !Array.isArray(authoring.promotions)) errors.push("PROMOTIONS_REQUIRED");
    if (!isRecord(authoring.survey) || authoring.survey.runtimeOwned !== true) errors.push("SURVEY_RUNTIME_OWNERSHIP_REQUIRED");
  }

  const experience = isRecord(value.experience) ? value.experience : null;
  if (!experience || experience.schemaVersion !== "hub-experience-blueprint-v2") errors.push("EXPERIENCE_BLUEPRINT_REQUIRED");

  const policies = isRecord(value.policies) ? value.policies : null;
  if (!policies
      || policies.assetPolicy !== "hotel_authorization_required"
      || policies.materializationPolicy !== "explicit_review_required"
      || policies.runtimeCampaignSend !== false
      || policies.liveActivation !== false) {
    errors.push("SAFETY_POLICIES_INVALID");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function asHubDesignDraftPayload(value: unknown): HubDesignDraftPayload | null {
  const validation = validateHubDesignDraftPayload(value);
  return validation.ok ? value as HubDesignDraftPayload : null;
}

function diffValues(left: unknown, right: unknown, path: string, changes: string[], limit: number) {
  if (changes.length >= limit) return;
  if (Object.is(left, right)) return;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) changes.push(`${path}.length`);
    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max && changes.length < limit; index += 1) {
      diffValues(left[index], right[index], `${path}[${index}]`, changes, limit);
    }
    return;
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (changes.length >= limit) return;
      diffValues(left[key], right[key], path ? `${path}.${key}` : key, changes, limit);
    }
    return;
  }

  changes.push(path || "$root");
}

export function diffHubDesignDraftPayloads(left: unknown, right: unknown, limit = 200): HubDesignDraftDiff {
  const changedPaths: string[] = [];
  diffValues(canonicalizeDesignDraftJson(left), canonicalizeDesignDraftJson(right), "", changedPaths, limit + 1);
  const truncated = changedPaths.length > limit;
  return {
    changedPaths: changedPaths.slice(0, limit),
    changeCount: changedPaths.length,
    truncated,
  };
}
