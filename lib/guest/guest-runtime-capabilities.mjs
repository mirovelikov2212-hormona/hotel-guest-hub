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
  const weatherEnabled = !factoryManaged;

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
