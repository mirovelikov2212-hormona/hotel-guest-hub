function text(value) {
  return String(value ?? "").trim();
}

export function getHotelOfferLocalDateKey(timeZone, now = new Date()) {
  const zone = text(timeZone) || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  } catch {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }
}

export function isHotelOfferVisible(offer, options = {}) {
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) return false;
  const status = text(offer.status).toLowerCase();
  if (status !== "active" && status !== "scheduled") return false;

  const currentDate = getHotelOfferLocalDateKey(options.timeZone, options.now);
  const startDate = offer.validity?.startDate ? text(offer.validity.startDate) : null;
  const endDate = offer.validity?.endDate ? text(offer.validity.endDate) : null;

  if (status === "scheduled" && !startDate) return false;
  if (startDate && currentDate < startDate) return false;
  if (endDate && currentDate > endDate) return false;
  return true;
}

export function getVisibleHotelOffers(offers, options = {}) {
  return (Array.isArray(offers) ? offers : [])
    .filter((offer) => isHotelOfferVisible(offer, options))
    .slice()
    .sort((left, right) => {
      const order = Number(left?.sortOrder ?? 999) - Number(right?.sortOrder ?? 999);
      if (order !== 0) return order;
      return text(left?.key).localeCompare(text(right?.key));
    });
}

export function collectVisibleHotelOfferAssetIds(offers, options = {}) {
  const ids = new Set();
  for (const offer of getVisibleHotelOffers(offers, options)) {
    const assets = offer?.assets;
    if (!assets || typeof assets !== "object" || Array.isArray(assets)) continue;
    if (assets.coverAssetId) ids.add(text(assets.coverAssetId).toLowerCase());
    for (const id of assets.galleryAssetIds || []) ids.add(text(id).toLowerCase());
    for (const id of assets.attachmentAssetIds || []) ids.add(text(id).toLowerCase());
  }
  return [...ids].filter(Boolean);
}

export function getHotelOfferLocalizedText(values, language) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "";
  const locale = text(language).toLowerCase();
  const exact = text(values[locale]);
  if (exact) return exact;
  const base = locale.split("-")[0];
  const baseValue = text(values[base]);
  if (baseValue) return baseValue;
  const english = text(values.en);
  if (english) return english;
  return Object.values(values).map(text).find(Boolean) || "";
}

export function buildGuestDesignAssetUrl(hotelSlug, assetId, options = {}) {
  const params = new URLSearchParams({
    hotelSlug: text(hotelSlug),
    assetId: text(assetId).toLowerCase(),
  });
  if (options.download === true) params.set("download", "1");
  return "/api/guest/design-asset?" + params.toString();
}
