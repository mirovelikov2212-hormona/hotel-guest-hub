import "server-only";

import { getCache } from "@vercel/functions";
import type { HotelConfig } from "@/lib/types";
import { normalizePublishedHotelConfigRuntime } from "@/lib/hotels/config-revision-contract.mjs";
import {
  attachGuestRequestRelationalAuthority,
  getGuestRequestRelationalAuthority,
} from "@/lib/server/guest-request-relational-ids.mjs";
import { getFactoryProductionRelationalAuthority } from "@/lib/server/factory-production-relational-authority";
import { getFactorySandboxRelationalAuthority } from "@/lib/server/factory-sandbox-relational-authority";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type PublicationStateRow = {
  published_revision_id: string | null;
  last_known_good_revision_id: string | null;
};

type PublishedRevisionRow = {
  id: string;
  status: string;
  source_checksum: string;
  config_json: unknown;
  validation_json: unknown;
};

type PublishedSnapshot = {
  revisionId: string;
  sourceChecksum: string;
  config: HotelConfig;
};

type PublishedBaseSnapshot = PublishedSnapshot & {
  validationJson: Record<string, unknown>;
  lastKnownGoodRevisionId: string | null;
};

type CachedPublishedSnapshot = PublishedSnapshot & {
  relationalAuthority: ReturnType<typeof getGuestRequestRelationalAuthority>;
};

// v2 intentionally separates canonicalized runtime entries from the historical
// v1 cache, which may contain persisted JSON that predates the RequestDef shape
// contract introduced by the Product Factory runtime.
const publishedConfigCache = getCache({ namespace: "published-hotel-config-v2" });
const publishedConfigLoads = new Map<string, Promise<PublishedSnapshot | null>>();
// Publication writes explicitly expire the per-hotel tag. A five-minute TTL
// therefore protects the database from cold-start fan-out without allowing a
// stale revision to survive a normal publication.
const PUBLISHED_CONFIG_CACHE_TTL_SECONDS = 300;

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

function getFactoryDepartmentNameByCode(config: HotelConfig) {
  const payload = config as unknown as Record<string, unknown>;
  const coreResources = isJsonObject(payload.factoryCoreResources)
    ? payload.factoryCoreResources
    : null;
  const departments = coreResources && Array.isArray(coreResources.departments)
    ? coreResources.departments
    : [];

  const names = new Map<string, string>();
  for (const candidate of departments) {
    if (!isJsonObject(candidate)) continue;
    const code = String(candidate.code || "").trim().toLowerCase();
    const name = String(candidate.name || "").trim();
    if (code && name) names.set(code, name);
  }
  return names;
}

function markFactoryManagedGuestRuntime(config: HotelConfig) {
  if (!isFactoryManagedConfigPayload(config)) return;

  const departmentNameByCode = getFactoryDepartmentNameByCode(config);
  const definitions = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  config.requestDefs = definitions.map((definition) => {
    const departmentCode = String(definition.targetDepartment || "").trim().toLowerCase();
    return {
      ...definition,
      factoryManagedGuestRuntime: true,
      factoryDepartmentName: departmentNameByCode.get(departmentCode) || undefined,
    };
  }) as HotelConfig["requestDefs"];
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

function normalizeRuntimeConfig(
  config: HotelConfig,
  context: { hotelId: string; revisionId: string },
) {
  const normalized = normalizePublishedHotelConfigRuntime(config);
  if (normalized.compatibilityDefaultsApplied.length > 0) {
    console.warn("Published hotel configuration compatibility defaults applied", {
      hotelId: context.hotelId,
      revisionId: context.revisionId,
      fields: normalized.compatibilityDefaultsApplied,
    });
  }
  return normalized.config;
}

/**
 * Read only the immutable published revision and publication pointer.
 *
 * This function deliberately does not read rooms, departments, routing rules,
 * runtime activation flags, or materialized tenant state. Projection and
 * reconciliation must be able to rebuild every derived runtime resource from
 * the published revision even when those derived resources are already stale.
 */
async function loadPublishedHotelConfigBaseSnapshot(
  hotelId: string,
): Promise<PublishedBaseSnapshot | null> {
  const normalizedHotelId = String(hotelId || "").trim();

  if (!normalizedHotelId) {
    throw new Error("Missing hotel id for published configuration lookup");
  }

  const { data: publicationState, error: stateError } = await supabaseAdmin
    .from("hotel_config_publication_state")
    .select("published_revision_id, last_known_good_revision_id")
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

  // Keep the immutable database payload as the projection/reconciliation source.
  // Runtime compatibility defaults are applied only in loadPublishedHotelConfigSnapshot.
  const config = structuredClone(row.config_json as HotelConfig);
  markFactoryManagedGuestRuntime(config);

  return {
    revisionId: row.id,
    sourceChecksum,
    config,
    validationJson: row.validation_json,
    lastKnownGoodRevisionId: state?.last_known_good_revision_id || null,
  };
}

async function loadPublishedHotelConfigSnapshot(
  hotelId: string,
): Promise<PublishedSnapshot | null> {
  const normalizedHotelId = String(hotelId || "").trim();
  const base = await loadPublishedHotelConfigBaseSnapshot(normalizedHotelId);
  if (!base) return null;

  const config = normalizeRuntimeConfig(structuredClone(base.config), {
    hotelId: normalizedHotelId,
    revisionId: base.revisionId,
  });

  // Runtime relational IDs are attached only to the guest/staff runtime view.
  // They are derived state and therefore must never be a prerequisite for the
  // projector that repairs that same derived state.
  if (base.lastKnownGoodRevisionId === base.revisionId) {
    const relationalAuthority = await getFactoryProductionRelationalAuthority({
      hotelId: normalizedHotelId,
      revisionId: base.revisionId,
      sourceChecksum: base.sourceChecksum,
    });
    attachGuestRequestRelationalAuthority(config, relationalAuthority);
  } else if (isFactorySandboxAcceptance(base.validationJson)) {
    const relationalAuthority = await getFactorySandboxRelationalAuthority({
      hotelId: normalizedHotelId,
      revisionId: base.revisionId,
      sourceChecksum: base.sourceChecksum,
      requestTypes: getConfiguredGuestRequestTypes(config),
    });
    attachGuestRequestRelationalAuthority(config, relationalAuthority);
  }

  return {
    revisionId: base.revisionId,
    sourceChecksum: base.sourceChecksum,
    config,
  };
}

/**
 * Projection/reconciliation source of truth. This intentionally bypasses the
 * runtime relational-authority cache so corrupted derived state can always be
 * rebuilt from the exact immutable published revision.
 */
export async function getPublishedHotelConfigProjectionSource(
  hotelId: string,
): Promise<PublishedSnapshot | null> {
  const base = await loadPublishedHotelConfigBaseSnapshot(hotelId);
  if (!base) return null;
  return {
    revisionId: base.revisionId,
    sourceChecksum: base.sourceChecksum,
    config: base.config,
  };
}

function restoreCachedSnapshot(cached: CachedPublishedSnapshot): PublishedSnapshot {
  const config = normalizeRuntimeConfig(structuredClone(cached.config), {
    hotelId: String(cached.config.hotelId || cached.config.hotelSlug || "cached"),
    revisionId: cached.revisionId,
  });
  if (cached.relationalAuthority) {
    attachGuestRequestRelationalAuthority(config, cached.relationalAuthority);
  }
  return { revisionId: cached.revisionId, sourceChecksum: cached.sourceChecksum, config };
}

export async function expirePublishedHotelConfigCache(hotelId: string) {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) return;
  await publishedConfigCache.expireTag(`hotel-config:${normalizedHotelId}`);
}

export async function getPublishedHotelConfigSnapshot(hotelId: string): Promise<PublishedSnapshot | null> {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) throw new Error("Missing hotel id for published configuration lookup");

  const cacheKey = `hotel:${normalizedHotelId}`;
  try {
    const cached = await publishedConfigCache.get(cacheKey) as CachedPublishedSnapshot | null;
    if (cached && typeof cached.revisionId === "string" && /^[a-f0-9]{64}$/.test(String(cached.sourceChecksum || "")) && isJsonObject(cached.config)) {
      return restoreCachedSnapshot(cached);
    }
  } catch (error) {
    console.warn("Published hotel configuration cache read failed; using authoritative database path", { hotelId: normalizedHotelId, error });
  }

  const existingLoad = publishedConfigLoads.get(normalizedHotelId);
  if (existingLoad) return existingLoad;

  const load = loadPublishedHotelConfigSnapshot(normalizedHotelId)
    .then(async (snapshot) => {
      if (!snapshot) return null;
      const cached: CachedPublishedSnapshot = {
        revisionId: snapshot.revisionId,
        sourceChecksum: snapshot.sourceChecksum,
        config: structuredClone(snapshot.config),
        relationalAuthority: getGuestRequestRelationalAuthority(snapshot.config),
      };
      try {
        await publishedConfigCache.set(cacheKey, cached, {
          ttl: PUBLISHED_CONFIG_CACHE_TTL_SECONDS,
          tags: ["published-hotel-config", `hotel-config:${normalizedHotelId}`],
          name: "published-hotel-config",
        });
      } catch (error) {
        console.warn("Published hotel configuration cache write failed; continuing with authoritative result", { hotelId: normalizedHotelId, error });
      }
      return snapshot;
    })
    .finally(() => publishedConfigLoads.delete(normalizedHotelId));

  publishedConfigLoads.set(normalizedHotelId, load);
  return load;
}
