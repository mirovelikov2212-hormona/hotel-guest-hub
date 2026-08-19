const DEFAULT_FACTORY_HERO = "/images/stayhub-factory-placeholder-hero.svg";

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function isEnabledGuestRequest(definition) {
  return Boolean(definition && definition.enabled !== false && definition.guestVisible !== false);
}

function isMassageBookingDefinition(definition) {
  const id = normalizeSlug(definition?.id);
  const requestType = normalizeSlug(definition?.requestType);
  return id === "massage_booking" || requestType === "massage_booking";
}

export function deriveGuestRuntimeCapabilities(config = {}) {
  const hotelSlug = normalizeSlug(config.hotelSlug || config.publicSlug);
  const requestDefs = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  const massageBookingEnabled = Boolean(hotelSlug) && requestDefs.some(
    (definition) => isEnabledGuestRequest(definition) && isMassageBookingDefinition(definition),
  );

  return {
    hotelSlug,
    coverImage: String(config.coverImage || "").trim() || DEFAULT_FACTORY_HERO,
    massageBookingEnabled,
  };
}
