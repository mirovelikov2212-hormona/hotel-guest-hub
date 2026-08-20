import "server-only";

import type { HotelConfig } from "@/lib/types";
import { attachGuestRequestRelationalAuthority } from "@/lib/server/guest-request-relational-ids.mjs";
import { getFactoryProductionRelationalAuthority } from "@/lib/server/factory-production-relational-authority";
import { getFactorySandboxRelationalAuthority } from "@/lib/server/factory-sandbox-relational-authority";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type PublicationStateRow = {
  published_revision_id: string | null;
};

type PublishedRevisionRow = {
  id: string;
  status: string;
  source_checksum: string;
  config_json: unknown;
  validation_json: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function hasValidationWarning(
  validationJson: Record<string, unknown>,
  expectedWarning: string,
) {
  const warnings = Array.isArray(validationJson.warnings)
    ? validationJson.warnings
    : [];
  return warnings.some(
    (warning) => String(warning || "") === expectedWarning,
  );
}

function isFactoryLivePilot(validationJson: Record<string, unknown>) {
  return hasValidationWarning(validationJson, "FACTORY_PRODUCTION_LIVE_PILOT");
}

function isFactorySandboxAcceptance(validationJson: Record<string, unknown>) {
  return hasValidationWarning(
    validationJson,
    "FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED",
  );
}

function isFactoryManagedConfigPayload(config: HotelConfig) {
  const payload = config as unknown as Record<string, unknown>;
  return Boolean(
    isJsonObject(payload.factoryBlueprint) &&
      isJsonObject(payload.factoryOnboardingEnvelope),
  );
}

function markFactoryManagedGuestRuntime(config: HotelConfig) {
  if (!isFactoryManagedConfigPayload(config)) return;

  const definitions = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  config.requestDefs = definitions.map((definition) => ({
    ...definition,
    factoryManagedGuestRuntime: true,
  })) as HotelConfig["requestDefs"];
}

function getConfiguredGuestRequestTypes(config: HotelConfig) {
  const defs = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  return Array.from(
    new Set(
      defs
        .filter(
          (definition) =>
            definition &&
            definition.enabled !== false &&
            definition.guestVisible !== false,
        )
        .map((definition) =>
          String(definition.requestType || definition.id || "").trim(),
        )
        .filter(Boolean),
    ),
  );
}

export async function getPublishedHotelConfigSnapshot(
  hotelId: string,
): Promise<{
  revisionId: string;
  sourceChecksum: string;
  config: HotelConfig;
} | null> {
  const normalizedHotelId = String(hotelId || "").trim();

  if (!normalizedHotelId) {
    throw new Error("Missing hotel id for published configuration lookup");
  }

  const { data: publicationState, error: stateError } = await supabaseAdmin
    .from("hotel_config_publication_state")
    .select("published_revision_id")
    .eq("hotel_id", normalizedHotelId)
    .maybeSingle();

  if (stateError) {
    throw new Error(
      `Published configuration state lookup failed: ${stateError.message}`,
    );
  }

  const state = publicationState as PublicationStateRow | null;
  const revisionId = String(state?.published_revision_id || "").trim();

  if (!revisionId) return null;

  const { data: revision, error: revisionError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id, status, source_checksum, config_json, validation_json")
    .eq("hotel_id", normalizedHotelId)
    .eq("id", revisionId)
    .maybeSingle();

  if (revisionError) {
    throw new Error(
      `Published configuration revision lookup failed: ${revisionError.message}`,
    );
  }

  const row = revision as PublishedRevisionRow | null;

  if (!row) {
    throw new Error(
      "Published configuration pointer references a missing revision",
    );
  }

  if (row.status !== "published") {
    throw new Error(
      `Published configuration pointer references non-published revision: ${row.status}`,
    );
  }

  if (
    !isJsonObject(row.validation_json) ||
    row.validation_json.ok !== true
  ) {
    throw new Error("Published configuration revision is not validated");
  }

  if (!isJsonObject(row.config_json)) {
    throw new Error("Published configuration revision payload is malformed");
  }

  const sourceChecksum = String(row.source_checksum || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourceChecksum)) {
    throw new Error("Published configuration revision checksum is malformed");
  }

  const config = { ...(row.config_json as HotelConfig) } as HotelConfig;
  markFactoryManagedGuestRuntime(config);

  if (isFactoryLivePilot(row.validation_json)) {
    const relationalAuthority = await getFactoryProductionRelationalAuthority({
      hotelId: normalizedHotelId,
      revisionId: row.id,
      sourceChecksum,
    });
    attachGuestRequestRelationalAuthority(config, relationalAuthority);
  } else if (isFactorySandboxAcceptance(row.validation_json)) {
    const relationalAuthority = await getFactorySandboxRelationalAuthority({
      hotelId: normalizedHotelId,
      revisionId: row.id,
      sourceChecksum,
      requestTypes: getConfiguredGuestRequestTypes(config),
    });
    attachGuestRequestRelationalAuthority(config, relationalAuthority);
  }

  return {
    revisionId: row.id,
    sourceChecksum,
    config,
  };
}
