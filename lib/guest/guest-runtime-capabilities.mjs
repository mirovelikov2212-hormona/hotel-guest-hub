const DEFAULT_FACTORY_HERO = "/images/stayhub-factory-placeholder-hero.svg";

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isEnabledGuestRequest(definition) {
  return Boolean(definition && definition.enabled !== false && definition.guestVisible !== false);
}

function isMassageBookingDefinition(definition) {
  const id = normalizeSlug(definition?.id);
  const requestType = normalizeSlug(definition?.requestType);
  return id === "massage_booking" || requestType === "massage_booking";
}

function hasFactoryManagedRequestDefinition(definitions) {
  return Array.isArray(definitions) && definitions.some(
    (definition) => definition?.factoryManagedGuestRuntime === true,
  );
}

function isFactoryAiReadEnabled(config) {
  const envelope = isObject(config.factoryOnboardingEnvelope)
    ? config.factoryOnboardingEnvelope
    : null;
  const permissions = envelope && isObject(envelope.ai_permissions)
    ? envelope.ai_permissions
    : null;
  const actions = permissions && isObject(permissions.actions)
    ? permissions.actions
    : null;

  return actions?.READ === true;
}

function hasUsableWeatherLocation(config) {
  const location = isObject(config.location) ? config.location : {};
  const latitude = Number(
    config.hotelLatitude ?? location.latitude ?? location.lat,
  );
  const longitude = Number(
    config.hotelLongitude ?? location.longitude ?? location.lng ?? location.lon,
  );
  const hasCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0);
  const query = String(location.query || "").trim();

  return hasCoordinates || Boolean(query);
}

export function isFactoryManagedGuestConfig(config = {}) {
  return Boolean(
    (isObject(config.factoryBlueprint) &&
      isObject(config.factoryOnboardingEnvelope)) ||
      hasFactoryManagedRequestDefinition(config.requestDefs),
  );
}

export function deriveGuestRuntimeCapabilities(config = {}) {
  const hotelSlug = normalizeSlug(config.hotelSlug || config.publicSlug);
  const requestDefs = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  const factoryManaged = isFactoryManagedGuestConfig(config);
  const massageBookingEnabled = Boolean(hotelSlug) && requestDefs.some(
    (definition) => isEnabledGuestRequest(definition) && isMassageBookingDefinition(definition),
  );
  const aiEnabled = factoryManaged ? isFactoryAiReadEnabled(config) : true;
  const weatherEnabled = factoryManaged
    ? config.weatherEnabled === true && hasUsableWeatherLocation(config)
    : true;

  return {
    hotelSlug,
    coverImage: String(config.coverImage || "").trim() || DEFAULT_FACTORY_HERO,
    massageBookingEnabled,
    aiEnabled,
    weatherEnabled,
    factoryManaged,
    legacyRequestFallbacksEnabled: !factoryManaged,
  };
}
