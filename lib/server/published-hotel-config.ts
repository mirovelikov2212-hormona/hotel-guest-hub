import "server-only";

import { getCache } from "@vercel/functions";
import type { HotelConfig } from "@/lib/types";
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

type CachedPublishedSnapshot = PublishedSnapshot & {
  relationalAuthority: ReturnType<typeof getGuestRequestRelationalAuthority>;
};

const publishedConfigCache = getCache({ namespace: "published-hotel-config-v1" });
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

async function loadPublishedHotelConfigSnapshot(
  hotelId: string,
): Promise<PublishedSnapshot | null> {
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

  const config = { ...(row.config_json as HotelConfig) } as HotelConfig;
  markFactoryManagedGuestRuntime(config);

  // P2.6.4 keeps the published revision immutable. LIVE reachability is therefore
  // represented by the publication rollback anchor (LKG) plus the fail-closed
  // relational-authority RPC, not by rewriting validation_json on the revision.
  if (state?.last_known_good_revision_id === row.id) {
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

function restoreCachedSnapshot(cached: CachedPublishedSnapshot): PublishedSnapshot {
  const config = structuredClone(cached.config);
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
