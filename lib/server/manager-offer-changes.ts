import "server-only";

import {
  HUB_OFFER_SCHEMA_VERSION,
  validateHubOfferV2,
  type HubLocalizedText,
  type HubOfferCtaAction,
  type HubOfferStatus,
  type HubOfferV2,
} from "@/lib/product-factory/hub-offer-contract";
import { buildHotelConfigVersionDiff } from "@/lib/server/factory-production-version-diff.mjs";
import {
  createManagerContentChangeDraft,
  loadManagerCurrentLiveConfig,
  resolveManagerContentChangeScope,
} from "@/lib/server/manager-content-changes";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const GUEST_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"] as const;
const ALLOWED_INTERNAL_DESTINATIONS = new Set(["home", "page-services", "page-offers"]);
const ALLOWED_STATUSES = new Set<HubOfferStatus>(["draft", "scheduled", "active", "inactive", "archived"]);
const ALLOWED_CTA_ACTIONS = new Set<HubOfferCtaAction>([
  "internal_page",
  "external_url",
  "request_service",
  "phone",
  "email",
  "none",
]);

type JsonObject = Record<string, unknown>;

type RuntimeOffer = {
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
    readyCreativeByLang?: Record<string, { assetId: string; kind: "image" | "document" }>;
  };
  presentationMode?: "structured" | "ready_asset";
  status: "active" | "scheduled";
  sortOrder: number;
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

function normalizeText(value: unknown, max = 4000) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new Error("CM5_OFFER_TEXT_TOO_LONG");
  return text;
}

function normalizeLocalized(value: unknown): HubLocalizedText {
  const record = isRecord(value) ? value : {};
  const result: HubLocalizedText = {};
  for (const language of GUEST_LANGUAGES) {
    const text = normalizeText(record[language]);
    if (text) result[language] = text;
  }
  return result;
}

function normalizeNullableMinor(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 9_999_999_999) {
    throw new Error("CM5_OFFER_PRICE_INVALID");
  }
  return number;
}

function normalizeNullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("CM5_OFFER_DATE_INVALID");
  return date;
}

function normalizeAssetId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeUuid(value, "CM5_OFFER_ASSET_ID_INVALID");
}

function normalizeAssetIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item) => normalizeUuid(item, "CM5_OFFER_ASSET_ID_INVALID"));
  if (ids.length > 20 || ids.length !== new Set(ids).size) {
    throw new Error("CM5_OFFER_ASSET_LIST_INVALID");
  }
  return ids;
}

function normalizeReadyCreativeByLang(value: unknown) {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error("CM5_OFFER_READY_CREATIVE_INVALID");
  const result: Record<string, { assetId: string; kind: "image" | "document" }> = {};
  for (const [language, creative] of Object.entries(value)) {
    if (!["default","bg","en","de","ro","cs","ru"].includes(language) || !isRecord(creative)) {
      throw new Error("CM5_OFFER_READY_CREATIVE_INVALID");
    }
    const assetId = normalizeUuid(creative.assetId, "CM5_OFFER_ASSET_ID_INVALID");
    const kind = String(creative.kind || "") as "image" | "document";
    if (kind !== "image" && kind !== "document") throw new Error("CM5_OFFER_READY_CREATIVE_INVALID");
    result[language] = { assetId, kind };
  }
  return result;
}

function runtimeOfferToEditorOffer(value: unknown, index: number): HubOfferV2 {
  if (!isRecord(value)) throw new Error("CM5_CURRENT_OFFER_INVALID");
  const pricing = isRecord(value.pricing) ? value.pricing : {};
  const validity = isRecord(value.validity) ? value.validity : {};
  const cta = isRecord(value.cta) ? value.cta : {};
  const assets = isRecord(value.assets) ? value.assets : {};

  const offer: HubOfferV2 = {
    schemaVersion: HUB_OFFER_SCHEMA_VERSION,
    id: normalizeUuid(value.id, "CM5_CURRENT_OFFER_ID_INVALID"),
    key: String(value.key || "").trim().toLowerCase(),
    titleByLang: normalizeLocalized(value.titleByLang),
    shortDescriptionByLang: normalizeLocalized(value.shortDescriptionByLang),
    descriptionByLang: normalizeLocalized(value.descriptionByLang),
    badgeByLang: normalizeLocalized(value.badgeByLang),
    pricing: {
      amountMinor: normalizeNullableMinor(pricing.amountMinor),
      previousAmountMinor: normalizeNullableMinor(pricing.previousAmountMinor),
      currency: pricing.currency ? String(pricing.currency).trim().toUpperCase() : null,
    },
    validity: {
      startDate: normalizeNullableDate(validity.startDate),
      endDate: normalizeNullableDate(validity.endDate),
    },
    cta: {
      labelByLang: normalizeLocalized(cta.labelByLang),
      action: String(cta.action || "none") as HubOfferCtaAction,
      destination: cta.destination ? String(cta.destination).trim() : null,
    },
    assets: {
      coverAssetId: normalizeAssetId(assets.coverAssetId),
      galleryAssetIds: normalizeAssetIds(assets.galleryAssetIds),
      attachmentAssetIds: normalizeAssetIds(assets.attachmentAssetIds),
      readyCreativeByLang: normalizeReadyCreativeByLang(assets.readyCreativeByLang),
    },
    presentationMode: String(value.presentationMode || "structured") as "structured" | "ready_asset",
    status: String(value.status || "active") as HubOfferStatus,
    sortOrder: Number.isInteger(Number(value.sortOrder)) ? Number(value.sortOrder) : index + 1,
    source: {
      kind: "change_editor",
      sourceRef: null,
    },
    designDraft: true,
  };

  const validation = validateHubOfferV2(offer);
  if (!validation.ok) {
    throw new Error("CM5_CURRENT_OFFER_INVALID:" + validation.errors.join(","));
  }
  return offer;
}

function currentRuntimeOffers(config: JsonObject) {
  const offers = Array.isArray(config.offers) ? config.offers : [];
  return offers.map((offer, index) => runtimeOfferToEditorOffer(offer, index));
}

function collectOwnedAssetIds(offers: HubOfferV2[]) {
  const result = new Set<string>();
  for (const offer of offers) {
    if (offer.assets.coverAssetId) result.add(offer.assets.coverAssetId);
    for (const id of offer.assets.galleryAssetIds) result.add(id);
    for (const id of offer.assets.attachmentAssetIds) result.add(id);
    for (const creative of Object.values(offer.assets.readyCreativeByLang || {})) result.add(creative.assetId);
  }
  return result;
}

function requestServiceDestinations(config: JsonObject) {
  const result = new Set<string>();
  for (const value of Array.isArray(config.requestDefs) ? config.requestDefs : []) {
    if (!isRecord(value)) continue;
    const id = String(value.id || "").trim();
    const requestType = String(value.requestType || "").trim();
    if (id) result.add(id);
    if (requestType) result.add(requestType);
  }
  return result;
}

function normalizeManagerOffer(
  value: unknown,
  index: number,
  currentById: Map<string, HubOfferV2>,
  ownedAssetIds: Set<string>,
  allowedRequestServices: Set<string>,
  changeRequestId: string,
) {
  if (!isRecord(value)) throw new Error("CM5_OFFER_OBJECT_REQUIRED");

  const id = normalizeUuid(value.id, "CM5_OFFER_ID_INVALID");
  const existing = currentById.get(id);
  const keyCandidate = String(value.key || existing?.key || "").trim().toLowerCase();
  if (!KEY_PATTERN.test(keyCandidate)) throw new Error("CM5_OFFER_KEY_INVALID");
  if (existing && existing.key !== keyCandidate) throw new Error("CM5_OFFER_KEY_IMMUTABLE");

  const pricing = isRecord(value.pricing) ? value.pricing : {};
  const validity = isRecord(value.validity) ? value.validity : {};
  const cta = isRecord(value.cta) ? value.cta : {};
  const assets = isRecord(value.assets) ? value.assets : {};

  const action = String(cta.action || "none") as HubOfferCtaAction;
  if (!ALLOWED_CTA_ACTIONS.has(action)) throw new Error("CM5_OFFER_CTA_ACTION_INVALID");
  const destination = cta.destination === null || cta.destination === undefined
    ? null
    : String(cta.destination).trim();

  if (action === "internal_page" && (!destination || !ALLOWED_INTERNAL_DESTINATIONS.has(destination))) {
    throw new Error("CM5_OFFER_INTERNAL_PAGE_UNSUPPORTED");
  }
  if (action === "request_service" && (!destination || !allowedRequestServices.has(destination))) {
    throw new Error("CM5_OFFER_REQUEST_SERVICE_UNSUPPORTED");
  }

  const coverAssetId = normalizeAssetId(assets.coverAssetId);
  const galleryAssetIds = normalizeAssetIds(assets.galleryAssetIds);
  const attachmentAssetIds = normalizeAssetIds(assets.attachmentAssetIds);
  const readyCreativeByLang = normalizeReadyCreativeByLang(assets.readyCreativeByLang);
  const presentationMode = String(value.presentationMode || "structured") as "structured" | "ready_asset";
  if (presentationMode !== "structured" && presentationMode !== "ready_asset") {
    throw new Error("CM5_OFFER_PRESENTATION_INVALID");
  }
  if (presentationMode === "ready_asset" && Object.keys(readyCreativeByLang).length < 1) {
    throw new Error("CM5_OFFER_READY_CREATIVE_REQUIRED");
  }
  for (const assetId of [coverAssetId, ...galleryAssetIds, ...attachmentAssetIds, ...Object.values(readyCreativeByLang).map((creative) => creative.assetId)].filter(Boolean) as string[]) {
    if (!ownedAssetIds.has(assetId)) throw new Error("CM5_OFFER_ASSET_NOT_OWNED");
  }

  const status = String(value.status || "active") as HubOfferStatus;
  if (!ALLOWED_STATUSES.has(status)) throw new Error("CM5_OFFER_STATUS_INVALID");

  const offer: HubOfferV2 = {
    schemaVersion: HUB_OFFER_SCHEMA_VERSION,
    id,
    key: keyCandidate,
    titleByLang: normalizeLocalized(value.titleByLang),
    shortDescriptionByLang: normalizeLocalized(value.shortDescriptionByLang),
    descriptionByLang: normalizeLocalized(value.descriptionByLang),
    badgeByLang: normalizeLocalized(value.badgeByLang),
    pricing: {
      amountMinor: normalizeNullableMinor(pricing.amountMinor),
      previousAmountMinor: normalizeNullableMinor(pricing.previousAmountMinor),
      currency: pricing.currency ? String(pricing.currency).trim().toUpperCase() : null,
    },
    validity: {
      startDate: normalizeNullableDate(validity.startDate),
      endDate: normalizeNullableDate(validity.endDate),
    },
    cta: {
      labelByLang: normalizeLocalized(cta.labelByLang),
      action,
      destination,
    },
    assets: {
      coverAssetId,
      galleryAssetIds,
      attachmentAssetIds,
      readyCreativeByLang,
    },
    presentationMode,
    status,
    sortOrder: index + 1,
    source: {
      kind: "change_editor",
      sourceRef: changeRequestId,
    },
    designDraft: true,
  };

  const validation = validateHubOfferV2(offer);
  if (!validation.ok) {
    throw new Error("CM5_OFFER_INVALID:" + validation.errors.join(","));
  }
  return offer;
}

function toRuntimeOffer(offer: HubOfferV2): RuntimeOffer | null {
  if (offer.status !== "active" && offer.status !== "scheduled") return null;
  return {
    id: offer.id,
    key: offer.key,
    titleByLang: offer.titleByLang,
    shortDescriptionByLang: offer.shortDescriptionByLang,
    descriptionByLang: offer.descriptionByLang,
    badgeByLang: offer.badgeByLang,
    pricing: { ...offer.pricing },
    validity: { ...offer.validity },
    cta: { ...offer.cta },
    assets: {
      coverAssetId: offer.assets.coverAssetId,
      galleryAssetIds: [...offer.assets.galleryAssetIds],
      attachmentAssetIds: [...offer.assets.attachmentAssetIds],
      readyCreativeByLang: Object.fromEntries(
        Object.entries(offer.assets.readyCreativeByLang || {}).map(([language, creative]) => [
          language,
          { ...creative },
        ]),
      ),
    },
    presentationMode: offer.presentationMode || "structured",
    status: offer.status,
    sortOrder: offer.sortOrder,
  };
}

function draftPreviewOffers(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== "manager-offer-preview-v1") return null;
  if (!Array.isArray(value.offers)) return null;
  try {
    return value.offers.map((offer, index) => {
      if (!isRecord(offer)) throw new Error("invalid");
      const candidate = {
        ...offer,
        source: {
          kind: "change_editor",
          sourceRef: isRecord(offer.source) ? String(offer.source.sourceRef || "") || null : null,
        },
        designDraft: true,
      };
      const validation = validateHubOfferV2(candidate);
      if (!validation.ok) throw new Error("invalid");
      return candidate as HubOfferV2;
    });
  } catch {
    return null;
  }
}

export async function getManagerOfferEditorState(hotelSlugInput: unknown) {
  const scope = await resolveManagerContentChangeScope(hotelSlugInput);
  const live = await loadManagerCurrentLiveConfig(scope.hotelId);
  const currentOffers = currentRuntimeOffers(live.config);

  const { data: drafts, error } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select("id,status,change_scope,base_live_revision_id,preview_json,diff_json,updated_at")
    .eq("hotel_id", scope.hotelId)
    .eq("status", "draft")
    .contains("change_scope", ["offers"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error("CM5_OFFER_DRAFT_READ_FAILED");
  const draft = drafts?.[0] ?? null;
  const stale = Boolean(
    draft
    && String(draft.base_live_revision_id || "").toLowerCase() !== live.revisionId,
  );
  const proposedOffers = !stale && draft
    ? draftPreviewOffers(draft.preview_json) || currentOffers
    : currentOffers;

  return {
    hotel: {
      id: scope.hotelId,
      slug: scope.hotelSlug,
      publicSlug: scope.hotelPublicSlug,
      name: scope.hotelName,
      environment: scope.isSandbox ? "sandbox" as const : "production" as const,
    },
    currentLive: {
      revisionId: live.revisionId,
      revisionNo: live.revisionNo,
    },
    currentOffers,
    draft: draft
      ? {
          id: normalizeUuid(draft.id, "CM5_CHANGE_REQUEST_ID_INVALID"),
          stale,
          updatedAt: String(draft.updated_at || ""),
          offers: proposedOffers,
          diff: isRecord(draft.diff_json) ? draft.diff_json : {},
        }
      : null,
  };
}

export async function saveManagerOfferDraft(input: {
  hotelSlug: unknown;
  changeRequestId?: unknown;
  offers: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const live = await loadManagerCurrentLiveConfig(scope.hotelId);
  const currentOffers = currentRuntimeOffers(live.config);

  let changeRequestId = input.changeRequestId
    ? normalizeUuid(input.changeRequestId, "CM5_CHANGE_REQUEST_ID_INVALID")
    : null;

  if (!changeRequestId) {
    const created = await createManagerContentChangeDraft({
      hotelSlug: scope.hotelSlug,
      changeScope: ["offers"],
    });
    changeRequestId = created.id;
  }

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select("id,status,change_scope,base_live_revision_id")
    .eq("id", changeRequestId)
    .eq("hotel_id", scope.hotelId)
    .maybeSingle();

  if (draftError) throw new Error("CM5_OFFER_CHANGE_REQUEST_READ_FAILED");
  if (
    !draft
    || draft.status !== "draft"
    || !Array.isArray(draft.change_scope)
    || !draft.change_scope.includes("offers")
  ) {
    throw new Error("CM5_OFFER_CHANGE_REQUEST_INVALID");
  }
  if (String(draft.base_live_revision_id || "").toLowerCase() !== live.revisionId) {
    throw new Error("CM5_STALE_LIVE_REVISION");
  }

  if (!Array.isArray(input.offers) || input.offers.length > 100) {
    throw new Error("CM5_OFFERS_ARRAY_INVALID");
  }

  const currentById = new Map(currentOffers.map((offer) => [offer.id, offer]));
  const ownedAssetIds = collectOwnedAssetIds(currentOffers);
  const allowedRequestServices = requestServiceDestinations(live.config);

  const offers = input.offers.map((offer, index) => normalizeManagerOffer(
    offer,
    index,
    currentById,
    ownedAssetIds,
    allowedRequestServices,
    changeRequestId!,
  ));

  const ids = offers.map((offer) => offer.id);
  const keys = offers.map((offer) => offer.key);
  if (ids.length !== new Set(ids).size) throw new Error("CM5_OFFER_ID_DUPLICATE");
  if (keys.length !== new Set(keys).size) throw new Error("CM5_OFFER_KEY_DUPLICATE");

  const runtimeOffers = offers
    .map(toRuntimeOffer)
    .filter((offer): offer is RuntimeOffer => Boolean(offer));

  const candidateConfig = structuredClone(live.config);
  candidateConfig.offers = runtimeOffers;
  const diff = buildHotelConfigVersionDiff(live.config, candidateConfig);

  const operations = [{
    schemaVersion: "manager-offer-change-v1",
    kind: "replace_offers",
    offers,
  }];
  const preview = {
    schemaVersion: "manager-offer-preview-v1",
    offers,
    runtimeOffers,
  };

  const { data, error } = await supabaseAdmin.rpc(
    "save_hotel_content_offer_draft_v1",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
      p_operations: operations,
      p_preview: preview,
      p_diff: diff,
    },
  );
  if (error) throw new Error(error.message || "CM5_OFFER_DRAFT_SAVE_FAILED");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_OFFER_DRAFT_SAVE_EMPTY");

  return {
    changeRequestId,
    status: String(row.status || "draft"),
    updatedAt: String(row.updated_at || ""),
    offers,
    runtimeOffers,
    diff,
  };
}
