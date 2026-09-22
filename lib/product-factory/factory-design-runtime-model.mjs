const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_OFFER_STATUSES = new Set(["active", "scheduled"]);
const CTA_ACTIONS = new Set(["internal_page", "external_url", "request_service", "phone", "email", "none"]);
const RUNTIME_INTERNAL_PAGE_DESTINATIONS = new Set(["home", "page-services", "page-offers"]);

function text(value) {
  return String(value ?? "").trim();
}

function textMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, candidate]) => [text(key).toLowerCase(), text(candidate)])
      .filter(([key, candidate]) => key && candidate),
  );
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function requireHex(value, code) {
  const normalized = text(value).toUpperCase();
  if (!HEX_COLOR.test(normalized)) throw new Error(code);
  return normalized;
}

function requireFont(value, code) {
  const normalized = text(value);
  if (!normalized || normalized.length > 160) throw new Error(code);
  return normalized;
}

function normalizeRuntimeOffer(offer) {
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
    throw new Error("FACTORY_DESIGN_OFFER_INVALID");
  }

  const id = text(offer.id).toLowerCase();
  const key = text(offer.key).toLowerCase();
  const status = text(offer.status).toLowerCase();
  if (!UUID.test(id) || !key || !RUNTIME_OFFER_STATUSES.has(status)) {
    throw new Error("FACTORY_DESIGN_OFFER_IDENTITY_INVALID");
  }

  const cta = offer.cta && typeof offer.cta === "object" && !Array.isArray(offer.cta)
    ? offer.cta
    : {};
  const action = text(cta.action).toLowerCase();
  if (!CTA_ACTIONS.has(action)) throw new Error("FACTORY_DESIGN_OFFER_CTA_INVALID");
  const destination = cta.destination ? text(cta.destination) : null;
  if (
    action === "internal_page"
    && (!destination || !RUNTIME_INTERNAL_PAGE_DESTINATIONS.has(destination))
  ) {
    throw new Error("FACTORY_DESIGN_OFFER_INTERNAL_PAGE_UNSUPPORTED");
  }

  const assets = offer.assets && typeof offer.assets === "object" && !Array.isArray(offer.assets)
    ? offer.assets
    : {};
  const coverAssetId = assets.coverAssetId ? text(assets.coverAssetId).toLowerCase() : null;
  const galleryAssetIds = uniqueStrings(assets.galleryAssetIds).map((value) => value.toLowerCase());
  const attachmentAssetIds = uniqueStrings(assets.attachmentAssetIds).map((value) => value.toLowerCase());
  if (
    (coverAssetId && !UUID.test(coverAssetId))
    || galleryAssetIds.some((value) => !UUID.test(value))
    || attachmentAssetIds.some((value) => !UUID.test(value))
  ) {
    throw new Error("FACTORY_DESIGN_OFFER_ASSET_INVALID");
  }

  const pricing = offer.pricing && typeof offer.pricing === "object" && !Array.isArray(offer.pricing)
    ? offer.pricing
    : {};
  const validity = offer.validity && typeof offer.validity === "object" && !Array.isArray(offer.validity)
    ? offer.validity
    : {};
  const amountMinor = pricing.amountMinor === null || pricing.amountMinor === undefined
    ? null
    : Number(pricing.amountMinor);
  const previousAmountMinor = pricing.previousAmountMinor === null || pricing.previousAmountMinor === undefined
    ? null
    : Number(pricing.previousAmountMinor);
  if (
    (amountMinor !== null && (!Number.isInteger(amountMinor) || amountMinor < 0))
    || (previousAmountMinor !== null && (!Number.isInteger(previousAmountMinor) || previousAmountMinor < 0))
  ) {
    throw new Error("FACTORY_DESIGN_OFFER_PRICE_INVALID");
  }

  const startDate = validity.startDate ? text(validity.startDate) : null;
  const endDate = validity.endDate ? text(validity.endDate) : null;
  if (status === "scheduled" && !startDate) {
    throw new Error("FACTORY_DESIGN_SCHEDULED_OFFER_START_REQUIRED");
  }

  return {
    id,
    key,
    titleByLang: textMap(offer.titleByLang),
    shortDescriptionByLang: textMap(offer.shortDescriptionByLang),
    descriptionByLang: textMap(offer.descriptionByLang),
    badgeByLang: textMap(offer.badgeByLang),
    pricing: {
      amountMinor,
      previousAmountMinor,
      currency: pricing.currency ? text(pricing.currency).toUpperCase() : null,
    },
    validity: { startDate, endDate },
    cta: {
      labelByLang: textMap(cta.labelByLang),
      action,
      destination,
    },
    assets: { coverAssetId, galleryAssetIds, attachmentAssetIds },
    status,
    sortOrder: Number.isInteger(Number(offer.sortOrder)) ? Number(offer.sortOrder) : 999,
  };
}

export function prepareFactoryDesignRuntime(input) {
  const designDraft = input?.designDraft;
  const fallbackTheme = input?.fallbackTheme || {};
  if (!designDraft || designDraft.schemaVersion !== "hub-experience-design-draft-v2") {
    throw new Error("FACTORY_DESIGN_DRAFT_INVALID");
  }

  const authoring = designDraft.authoring;
  const authoredTheme = authoring?.theme;
  if (!authoredTheme || typeof authoredTheme !== "object" || Array.isArray(authoredTheme)) {
    throw new Error("FACTORY_DESIGN_THEME_REQUIRED");
  }

  const sourceKey = text(input.sourceKey).toLowerCase();
  const revisionId = text(input.sourceDesignRevisionId).toLowerCase();
  const revisionChecksum = text(input.sourceDesignRevisionChecksum).toLowerCase();
  if (!SHA256.test(sourceKey) || !UUID.test(revisionId) || !SHA256.test(revisionChecksum)) {
    throw new Error("FACTORY_DESIGN_LINEAGE_INVALID");
  }

  const offers = (Array.isArray(authoring.offers) ? authoring.offers : [])
    .filter((offer) => RUNTIME_OFFER_STATUSES.has(text(offer?.status).toLowerCase()))
    .map(normalizeRuntimeOffer)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key));

  const assetIds = uniqueStrings(
    offers.flatMap((offer) => [
      offer.assets.coverAssetId,
      ...offer.assets.galleryAssetIds,
      ...offer.assets.attachmentAssetIds,
    ]),
  ).map((value) => value.toLowerCase()).sort();

  return {
    schemaVersion: "factory-design-runtime-v1",
    authority: "exact_immutable_design_revision",
    sourceDesignRevisionId: revisionId,
    sourceDesignRevisionChecksum: revisionChecksum,
    assetSourceKey: sourceKey,
    theme: {
      primary: requireHex(authoredTheme.primaryColor, "FACTORY_DESIGN_PRIMARY_INVALID"),
      secondary: requireHex(authoredTheme.secondaryColor, "FACTORY_DESIGN_SECONDARY_INVALID"),
      accent: requireHex(authoredTheme.secondaryColor, "FACTORY_DESIGN_ACCENT_INVALID"),
      background: requireHex(authoredTheme.backgroundColor, "FACTORY_DESIGN_BACKGROUND_INVALID"),
      surface: requireHex(fallbackTheme.surfaceColor || "#FFFFFF", "FACTORY_DESIGN_SURFACE_INVALID"),
      text: requireHex(fallbackTheme.textColor || "#202124", "FACTORY_DESIGN_TEXT_INVALID"),
      soft: requireHex(fallbackTheme.softAccentColor || "#F2F7F6", "FACTORY_DESIGN_SOFT_INVALID"),
      muted: requireHex(fallbackTheme.mutedColor || "#707070", "FACTORY_DESIGN_MUTED_INVALID"),
      headingFont: requireFont(authoredTheme.headingFont, "FACTORY_DESIGN_HEADING_FONT_INVALID"),
      bodyFont: requireFont(authoredTheme.bodyFont, "FACTORY_DESIGN_BODY_FONT_INVALID"),
    },
    offers,
    assetIds,
  };
}

export function validateFactoryDesignRuntime(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("FACTORY_DESIGN_RUNTIME_REQUIRED");
    }
    if (value.schemaVersion !== "factory-design-runtime-v1") {
      throw new Error("FACTORY_DESIGN_RUNTIME_SCHEMA_INVALID");
    }
    if (value.authority !== "exact_immutable_design_revision") {
      throw new Error("FACTORY_DESIGN_RUNTIME_AUTHORITY_INVALID");
    }
    if (!SHA256.test(text(value.assetSourceKey))) throw new Error("FACTORY_DESIGN_RUNTIME_SOURCE_INVALID");
    if (!UUID.test(text(value.sourceDesignRevisionId))) throw new Error("FACTORY_DESIGN_RUNTIME_REVISION_INVALID");
    if (!SHA256.test(text(value.sourceDesignRevisionChecksum))) throw new Error("FACTORY_DESIGN_RUNTIME_CHECKSUM_INVALID");

    if (!value.theme || typeof value.theme !== "object" || Array.isArray(value.theme)) {
      throw new Error("FACTORY_DESIGN_RUNTIME_THEME_INVALID");
    }
    for (const key of ["primary","secondary","accent","background","surface","text","soft","muted"]) {
      requireHex(value.theme[key], "FACTORY_DESIGN_RUNTIME_THEME_INVALID");
    }
    requireFont(value.theme.headingFont, "FACTORY_DESIGN_RUNTIME_FONT_INVALID");
    requireFont(value.theme.bodyFont, "FACTORY_DESIGN_RUNTIME_FONT_INVALID");

    if (!Array.isArray(value.offers) || !Array.isArray(value.assetIds)) {
      throw new Error("FACTORY_DESIGN_RUNTIME_CONTENT_INVALID");
    }
    value.offers.forEach(normalizeRuntimeOffer);
    if (value.assetIds.some((id) => !UUID.test(text(id)))) {
      throw new Error("FACTORY_DESIGN_RUNTIME_ASSET_INVALID");
    }

    const referenced = uniqueStrings(
      value.offers.flatMap((offer) => [
        offer.assets?.coverAssetId,
        ...(offer.assets?.galleryAssetIds || []),
        ...(offer.assets?.attachmentAssetIds || []),
      ]),
    ).map((item) => item.toLowerCase()).sort();

    const declared = uniqueStrings(value.assetIds).map((item) => item.toLowerCase()).sort();
    if (JSON.stringify(referenced) !== JSON.stringify(declared)) {
      throw new Error("FACTORY_DESIGN_RUNTIME_ASSET_LINEAGE_INVALID");
    }

    return { ok: true, errors: [] };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "FACTORY_DESIGN_RUNTIME_INVALID"],
    };
  }
}
