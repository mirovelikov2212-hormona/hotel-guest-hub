import crypto from "node:crypto";

import { validateFactoryBlueprint } from "./factory-blueprint-model.mjs";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const FORBIDDEN_SECRET_KEY =
  /^(secret|password|token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key)$/i;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stableValue(value[key])]),
    );
  }

  return value;
}

export function stableFactoryJson(value) {
  return JSON.stringify(stableValue(value));
}

export function hashFactoryBlueprint(blueprint) {
  return crypto.createHash("sha256").update(stableFactoryJson(blueprint)).digest("hex");
}

function assertNoEmbeddedSecrets(value, path = "blueprint") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoEmbeddedSecrets(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEY.test(key)) {
      throw new Error(`P2_FACTORY_SECRET_FORBIDDEN:${path}.${key}`);
    }
    assertNoEmbeddedSecrets(child, `${path}.${key}`);
  }
}

function normalizeSlug(value, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new Error(`P2_FACTORY_INVALID_SLUG:${field}`);
  }
  return normalized;
}

function normalizeName(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 160) {
    throw new Error(`P2_FACTORY_INVALID_NAME:${field}`);
  }
  return normalized;
}

function normalizeCountryCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(normalized)) {
    throw new Error("P2_FACTORY_INVALID_COUNTRY_CODE");
  }
  return normalized;
}

function normalizeLocales(locales) {
  return Intl.getCanonicalLocales(locales.map((locale) => String(locale || "").trim()));
}

export function prepareFactoryOnboarding({ blueprint, idempotencyKey }) {
  validateFactoryBlueprint(blueprint);

  const normalizedIdempotencyKey = String(idempotencyKey || "").trim();
  if (!IDEMPOTENCY_PATTERN.test(normalizedIdempotencyKey)) {
    throw new Error("P2_FACTORY_INVALID_IDEMPOTENCY_KEY");
  }

  assertNoEmbeddedSecrets(blueprint);

  const normalizedBlueprint = JSON.parse(stableFactoryJson(blueprint));
  normalizedBlueprint.organization.id = normalizeSlug(
    normalizedBlueprint.organization.id,
    "organization.id",
  );
  normalizedBlueprint.organization.name = normalizeName(
    normalizedBlueprint.organization.name,
    "organization.name",
  );
  normalizedBlueprint.property.slug = normalizeSlug(
    normalizedBlueprint.property.slug,
    "property.slug",
  );
  normalizedBlueprint.property.publicSlug = normalizeSlug(
    normalizedBlueprint.property.publicSlug,
    "property.publicSlug",
  );
  normalizedBlueprint.property.name = normalizeName(
    normalizedBlueprint.property.name,
    "property.name",
  );
  normalizedBlueprint.property.countryCode = normalizeCountryCode(
    normalizedBlueprint.property.countryCode,
  );
  normalizedBlueprint.property.timezone = String(
    normalizedBlueprint.property.timezone || "",
  ).trim();
  normalizedBlueprint.property.locales = normalizeLocales(
    normalizedBlueprint.property.locales,
  );

  validateFactoryBlueprint(normalizedBlueprint);
  assertNoEmbeddedSecrets(normalizedBlueprint);

  const propertySlug = normalizedBlueprint.property.slug;
  const publicSlug = normalizedBlueprint.property.publicSlug;
  const sandboxSlug = normalizeSlug(`${propertySlug}-sandbox`, "property.sandboxSlug");
  const sandboxPublicSlug = normalizeSlug(
    `${publicSlug}-sandbox`,
    "property.sandboxPublicSlug",
  );

  if (
    sandboxSlug === propertySlug ||
    sandboxSlug === publicSlug ||
    sandboxPublicSlug === propertySlug ||
    sandboxPublicSlug === publicSlug
  ) {
    throw new Error("P2_FACTORY_CROSS_ENVIRONMENT_IDENTITY_COLLISION");
  }

  return {
    idempotencyKey: normalizedIdempotencyKey,
    blueprint: normalizedBlueprint,
    blueprintHash: hashFactoryBlueprint(normalizedBlueprint),
    identities: {
      organizationSlug: normalizedBlueprint.organization.id,
      propertySlug,
      publicSlug,
      productionSlug: propertySlug,
      productionPublicSlug: publicSlug,
      sandboxSlug,
      sandboxPublicSlug,
    },
  };
}
