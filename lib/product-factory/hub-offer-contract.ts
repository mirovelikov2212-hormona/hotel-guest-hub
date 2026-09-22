export const HUB_OFFER_SCHEMA_VERSION = "hub-offer-v2" as const;

export type HubLocalizedText = Record<string, string>;
export type HubOfferStatus = "draft" | "scheduled" | "active" | "inactive" | "archived";
export type HubOfferCtaAction = "internal_page" | "external_url" | "request_service" | "phone" | "email" | "none";
export type HubOfferSourceKind = "design_studio" | "change_editor" | "import";

export type HubOfferV2 = {
  schemaVersion: typeof HUB_OFFER_SCHEMA_VERSION;
  id: string;
  key: string;
  titleByLang: HubLocalizedText;
  shortDescriptionByLang: HubLocalizedText;
  descriptionByLang: HubLocalizedText;
  badgeByLang: HubLocalizedText;
  pricing: {
    amountMinor: number | null;
    previousAmountMinor: number | null;
    currency: string | null;
  };
  validity: {
    startDate: string | null;
    endDate: string | null;
  };
  cta: {
    labelByLang: HubLocalizedText;
    action: HubOfferCtaAction;
    destination: string | null;
  };
  assets: {
    coverAssetId: string | null;
    galleryAssetIds: string[];
    attachmentAssetIds: string[];
  };
  status: HubOfferStatus;
  sortOrder: number;
  source: {
    kind: HubOfferSourceKind;
    sourceRef: string | null;
  };
  designDraft: true;
};

export type HubOfferValidation = {
  ok: boolean;
  errors: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CTA_ACTIONS = new Set<HubOfferCtaAction>(["internal_page", "external_url", "request_service", "phone", "email", "none"]);
const STATUSES = new Set<HubOfferStatus>(["draft", "scheduled", "active", "inactive", "archived"]);
const SOURCE_KINDS = new Set<HubOfferSourceKind>(["design_studio", "change_editor", "import"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localizedTextErrors(value: unknown, code: string, required: boolean) {
  if (!isRecord(value)) return [code + "_OBJECT_REQUIRED"];
  const entries = Object.entries(value);
  if (entries.some(([locale, text]) => !locale.trim() || typeof text !== "string" || text.length > 4000)) {
    return [code + "_INVALID"];
  }
  if (required && !entries.some(([, text]) => String(text).trim().length > 0)) {
    return [code + "_REQUIRED"];
  }
  return [];
}

function isNullableUuid(value: unknown) {
  return value === null || UUID_PATTERN.test(String(value || ""));
}

function validUuidArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) return false;
  const ids = value.map((item) => String(item || ""));
  return ids.every((id) => UUID_PATTERN.test(id)) && ids.length === new Set(ids).size;
}

function validMinorAmount(value: unknown) {
  return value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 9_999_999_999);
}

function validDate(value: unknown) {
  return value === null || DATE_PATTERN.test(String(value || ""));
}

function destinationLooksValid(action: HubOfferCtaAction, destination: string | null) {
  if (action === "none") return destination === null;
  if (!destination) return false;
  if (action !== "external_url") return destination.length <= 2048;
  try {
    const url = new URL(destination);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getHubOfferLocalizedText(values: HubLocalizedText, language: string) {
  const exact = String(values?.[language] || "").trim();
  if (exact) return exact;
  const base = String(language || "").split("-")[0].toLowerCase();
  const baseValue = String(values?.[base] || "").trim();
  if (baseValue) return baseValue;
  const english = String(values?.en || "").trim();
  if (english) return english;
  return Object.values(values || {}).map((value) => String(value || "").trim()).find(Boolean) || "";
}

export function setHubOfferLocalizedText(values: HubLocalizedText, language: string, value: string): HubLocalizedText {
  const locale = String(language || "").trim().toLowerCase();
  if (!locale) return { ...(values || {}) };
  const next = { ...(values || {}) };
  if (value.length > 0) next[locale] = value;
  else delete next[locale];
  return next;
}

export function validateHubOfferV2(value: unknown): HubOfferValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["OFFER_OBJECT_REQUIRED"] };

  if (value.schemaVersion !== HUB_OFFER_SCHEMA_VERSION) errors.push("OFFER_SCHEMA_VERSION_INVALID");
  if (!UUID_PATTERN.test(String(value.id || ""))) errors.push("OFFER_ID_INVALID");
  if (!KEY_PATTERN.test(String(value.key || ""))) errors.push("OFFER_KEY_INVALID");

  errors.push(...localizedTextErrors(value.titleByLang, "OFFER_TITLE", true));
  errors.push(...localizedTextErrors(value.shortDescriptionByLang, "OFFER_SHORT_DESCRIPTION", false));
  errors.push(...localizedTextErrors(value.descriptionByLang, "OFFER_DESCRIPTION", false));
  errors.push(...localizedTextErrors(value.badgeByLang, "OFFER_BADGE", false));

  const pricing = isRecord(value.pricing) ? value.pricing : null;
  if (!pricing) {
    errors.push("OFFER_PRICING_REQUIRED");
  } else {
    if (!validMinorAmount(pricing.amountMinor)) errors.push("OFFER_PRICE_INVALID");
    if (!validMinorAmount(pricing.previousAmountMinor)) errors.push("OFFER_PREVIOUS_PRICE_INVALID");
    const currency = pricing.currency === null ? null : String(pricing.currency || "");
    if (currency !== null && !CURRENCY_PATTERN.test(currency)) errors.push("OFFER_CURRENCY_INVALID");
    if ((pricing.amountMinor !== null || pricing.previousAmountMinor !== null) && !currency) {
      errors.push("OFFER_CURRENCY_REQUIRED");
    }
  }

  const validity = isRecord(value.validity) ? value.validity : null;
  if (!validity) {
    errors.push("OFFER_VALIDITY_REQUIRED");
  } else {
    if (!validDate(validity.startDate)) errors.push("OFFER_START_DATE_INVALID");
    if (!validDate(validity.endDate)) errors.push("OFFER_END_DATE_INVALID");
    if (
      typeof validity.startDate === "string"
      && typeof validity.endDate === "string"
      && validity.endDate < validity.startDate
    ) {
      errors.push("OFFER_DATE_RANGE_INVALID");
    }
  }

  const cta = isRecord(value.cta) ? value.cta : null;
  if (!cta) {
    errors.push("OFFER_CTA_REQUIRED");
  } else {
    const action = String(cta.action || "") as HubOfferCtaAction;
    if (!CTA_ACTIONS.has(action)) errors.push("OFFER_CTA_ACTION_INVALID");
    errors.push(...localizedTextErrors(cta.labelByLang, "OFFER_CTA_LABEL", action !== "none"));
    const destination = cta.destination === null ? null : String(cta.destination || "").trim();
    if (CTA_ACTIONS.has(action) && !destinationLooksValid(action, destination)) {
      errors.push("OFFER_CTA_DESTINATION_INVALID");
    }
  }

  const assets = isRecord(value.assets) ? value.assets : null;
  if (!assets) {
    errors.push("OFFER_ASSETS_REQUIRED");
  } else {
    if (!isNullableUuid(assets.coverAssetId)) errors.push("OFFER_COVER_ASSET_INVALID");
    if (!validUuidArray(assets.galleryAssetIds, 20)) errors.push("OFFER_GALLERY_ASSETS_INVALID");
    if (!validUuidArray(assets.attachmentAssetIds, 20)) errors.push("OFFER_ATTACHMENT_ASSETS_INVALID");
  }

  if (!STATUSES.has(String(value.status || "") as HubOfferStatus)) errors.push("OFFER_STATUS_INVALID");
  if (!Number.isInteger(value.sortOrder) || Number(value.sortOrder) < 1 || Number(value.sortOrder) > 10000) {
    errors.push("OFFER_SORT_ORDER_INVALID");
  }

  const source = isRecord(value.source) ? value.source : null;
  if (!source) {
    errors.push("OFFER_SOURCE_REQUIRED");
  } else {
    if (!SOURCE_KINDS.has(String(source.kind || "") as HubOfferSourceKind)) errors.push("OFFER_SOURCE_KIND_INVALID");
    if (source.sourceRef !== null && (typeof source.sourceRef !== "string" || source.sourceRef.length > 240)) {
      errors.push("OFFER_SOURCE_REF_INVALID");
    }
  }

  if (value.designDraft !== true) errors.push("OFFER_DESIGN_DRAFT_REQUIRED");

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
