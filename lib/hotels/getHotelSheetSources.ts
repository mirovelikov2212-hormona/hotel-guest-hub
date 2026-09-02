import { getCache } from "@vercel/functions";
import {
  buildHotelSlugOrFilter,
  getHotelSlugCandidates,
} from "@/lib/hotels/hotel-slug.mjs";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type HotelSheetSources = {
  hotelId: string;
  hotelSlug: string;
  publicSlug?: string | null;
  isSandbox?: boolean | null;
  productionHotelId?: string | null;
  hotelName?: string | null;
  hotelTimezone?: string | null;
  configUrl?: string | null;
  venuesUrl?: string | null;
  i18nUrl?: string | null;
  hotelSetupUrl?: string | null;
  requestDefsUrl?: string | null;
};

type MaterializedTenantRuntime = {
  status?: string | null;
  hotelId?: string | null;
  hotelSlug?: string | null;
  publicSlug?: string | null;
  isSandbox?: boolean | null;
  productionHotelId?: string | null;
  hotelName?: string | null;
  hotelTimezone?: string | null;
  configUrl?: string | null;
  venuesUrl?: string | null;
  i18nUrl?: string | null;
  hotelSetupUrl?: string | null;
  requestDefsUrl?: string | null;
  publishedRevisionId?: string | null;
  sourceChecksum?: string | null;
  config?: Record<string, unknown> | null;
  relationalAuthority?: Record<string, unknown> | null;
  testRoomNumbers?: unknown[] | null;
};

const hotelSheetSourcesCache = getCache({ namespace: "hotel-sheet-sources-v1" });
const publishedConfigCache = getCache({ namespace: "published-hotel-config-v1" });
const normalizedRuntimeCache = getCache({ namespace: "normalized-config-runtime-v1" });
const HOTEL_SHEET_SOURCES_TTL_SECONDS = 300;
const SHARED_RUNTIME_TTL_SECONDS = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function markFactoryManagedGuestRuntime(config: Record<string, unknown>) {
  if (!isObject(config.factoryBlueprint) || !isObject(config.factoryOnboardingEnvelope)) return;

  const coreResources = isObject(config.factoryCoreResources) ? config.factoryCoreResources : null;
  const departments = coreResources && Array.isArray(coreResources.departments)
    ? coreResources.departments
    : [];
  const departmentNameByCode = new Map<string, string>();

  for (const candidate of departments) {
    if (!isObject(candidate)) continue;
    const code = String(candidate.code || "").trim().toLowerCase();
    const name = String(candidate.name || "").trim();
    if (code && name) departmentNameByCode.set(code, name);
  }

  if (!Array.isArray(config.requestDefs)) return;
  config.requestDefs = config.requestDefs.map((candidate) => {
    if (!isObject(candidate)) return candidate;
    const departmentCode = String(candidate.targetDepartment || "").trim().toLowerCase();
    return {
      ...candidate,
      factoryManagedGuestRuntime: true,
      factoryDepartmentName: departmentNameByCode.get(departmentCode) || undefined,
    };
  });
}

function getAuthorityMap(authority: Record<string, unknown>, key: string) {
  const value = authority[key];
  return isObject(value) ? value as Record<string, string> : null;
}

async function primeSharedRuntimeCaches(runtime: MaterializedTenantRuntime) {
  const hotelId = String(runtime.hotelId || "").trim();
  const revisionId = String(runtime.publishedRevisionId || "").trim();
  const sourceChecksum = String(runtime.sourceChecksum || "").trim().toLowerCase();
  if (!hotelId || !revisionId || !/^[a-f0-9]{64}$/.test(sourceChecksum) || !isObject(runtime.config)) return;

  const config = structuredClone(runtime.config);
  markFactoryManagedGuestRuntime(config);
  const authority = isObject(runtime.relationalAuthority) ? runtime.relationalAuthority : {};
  const roomIdByNumber = getAuthorityMap(authority, "roomIdByNumber");
  const departmentIdByCode = getAuthorityMap(authority, "departmentIdByCode");
  const routingDepartmentIdByRequestType = getAuthorityMap(authority, "routingDepartmentIdByRequestType");
  const tag = `hotel-config:${hotelId}`;

  const writes: Promise<unknown>[] = [
    publishedConfigCache.set(
      `hotel:${hotelId}`,
      {
        revisionId,
        sourceChecksum,
        config,
        relationalAuthority:
          roomIdByNumber && departmentIdByCode && routingDepartmentIdByRequestType
            ? {
                revisionId,
                sourceChecksum,
                roomIdByNumber,
                departmentIdByCode,
                routingDepartmentIdByRequestType,
              }
            : null,
      },
      {
        ttl: SHARED_RUNTIME_TTL_SECONDS,
        tags: ["published-hotel-config", tag],
        name: "published-hotel-config",
      },
    ),
  ];

  if (roomIdByNumber) {
    writes.push(
      normalizedRuntimeCache.set(
        `rooms:${hotelId}:${revisionId}:${sourceChecksum}`,
        {
          ok: true,
          source: "normalized",
          reason: null,
          config,
          relationalAuthority: { revisionId, sourceChecksum, roomIdByNumber },
        },
        {
          ttl: SHARED_RUNTIME_TTL_SECONDS,
          tags: ["normalized-config-runtime", tag],
          name: "normalized-config-runtime",
        },
      ),
    );
  }

  if (departmentIdByCode && routingDepartmentIdByRequestType) {
    writes.push(
      normalizedRuntimeCache.set(
        `departments:${hotelId}:${revisionId}:${sourceChecksum}`,
        {
          ok: true,
          source: "normalized",
          reason: null,
          config,
          relationalAuthority: {
            revisionId,
            sourceChecksum,
            departmentIdByCode,
            routingDepartmentIdByRequestType,
          },
        },
        {
          ttl: SHARED_RUNTIME_TTL_SECONDS,
          tags: ["normalized-config-runtime", tag],
          name: "normalized-config-runtime",
        },
      ),
    );
  }

  const settled = await Promise.allSettled(writes);
  if (settled.some((result) => result.status === "rejected")) {
    console.warn("Shared materialized tenant runtime cache priming was partially unavailable", {
      hotelId,
      revisionId,
    });
  }
}

async function readMaterializedSandboxRuntime(candidate: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_factory_tenant_runtime_v1", {
    p_hotel_slug: candidate,
  });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const missingMaterializer =
      message.includes("get_factory_tenant_runtime_v1") &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"));
    if (!missingMaterializer) {
      console.warn("Shared materialized tenant runtime lookup failed; using legacy directory path", {
        candidate,
        error,
      });
    }
    return null;
  }

  return isObject(data) ? data as MaterializedTenantRuntime : null;
}

async function resolveMaterializedSandboxRuntime(candidates: string[]) {
  const candidate = String(candidates[0] || "").trim().toLowerCase();
  if (!candidate) return null;

  let runtime = await readMaterializedSandboxRuntime(candidate);
  if (!runtime) return null;

  if (runtime.status === "projection_stale") {
    const hotelSlug = String(runtime.hotelSlug || candidate).trim().toLowerCase();
    const { projectPublishedHotelConfig } = await import("@/lib/server/config-projection");
    const reconciled = await projectPublishedHotelConfig({
      hotelSlug,
      dryRun: false,
      actor: "automatic_tenant_runtime_reconciliation",
    });

    if (!reconciled.ok) {
      console.warn("Automatic Sandbox tenant projection reconciliation did not complete", {
        hotelSlug,
        error: reconciled.error,
      });
      return null;
    }

    runtime = await readMaterializedSandboxRuntime(hotelSlug);
  }

  if (
    runtime?.status !== "ready" ||
    runtime.isSandbox !== true ||
    !runtime.hotelId ||
    !runtime.hotelSlug ||
    !runtime.publishedRevisionId ||
    !runtime.sourceChecksum ||
    !isObject(runtime.config)
  ) {
    return null;
  }

  return runtime;
}

async function cacheHotelSheetSources(cacheKey: string, result: HotelSheetSources) {
  try {
    await hotelSheetSourcesCache.set(cacheKey, result, {
      ttl: HOTEL_SHEET_SOURCES_TTL_SECONDS,
      tags: ["hotel-directory", `hotel-directory:${result.hotelId}`],
      name: "hotel-sheet-sources",
    });
  } catch (cacheError) {
    console.warn("Hotel directory cache write failed; continuing with authoritative result", {
      hotelId: result.hotelId,
      cacheError,
    });
  }
}

export async function expireHotelSheetSourcesCache(hotelId: string) {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) return;
  await hotelSheetSourcesCache.expireTag(`hotel-directory:${normalizedHotelId}`);
}

export async function getHotelSheetSources(inputSlug?: string): Promise<HotelSheetSources> {
  const candidates = getHotelSlugCandidates(inputSlug ?? "");

  if (!candidates.length) {
    throw new Error("Missing hotel slug");
  }

  const slugFilter = buildHotelSlugOrFilter(candidates);
  const cacheKey = `slug:${candidates.join("|")}`;
  try {
    const cached = await hotelSheetSourcesCache.get(cacheKey) as HotelSheetSources | null;
    if (cached?.hotelId && cached.hotelSlug) return cached;
  } catch (error) {
    console.warn("Hotel directory cache read failed; using authoritative database path", { candidates, error });
  }

  try {
    const materialized = await resolveMaterializedSandboxRuntime(candidates);
    if (materialized) {
      const result: HotelSheetSources = {
        hotelId: String(materialized.hotelId),
        hotelSlug: String(materialized.hotelSlug),
        publicSlug: materialized.publicSlug ?? null,
        isSandbox: true,
        productionHotelId: materialized.productionHotelId ?? null,
        hotelName: materialized.hotelName ?? String(materialized.config?.hotelName || ""),
        hotelTimezone: materialized.hotelTimezone ?? String(materialized.config?.hotelTimezone || ""),
        configUrl: materialized.configUrl ?? null,
        venuesUrl: materialized.venuesUrl ?? null,
        i18nUrl: materialized.i18nUrl ?? null,
        hotelSetupUrl: materialized.hotelSetupUrl ?? null,
        requestDefsUrl: materialized.requestDefsUrl ?? null,
      };

      await Promise.all([
        cacheHotelSheetSources(cacheKey, result),
        primeSharedRuntimeCaches(materialized),
      ]);
      return result;
    }
  } catch (error) {
    console.warn("Shared Sandbox tenant runtime bootstrap failed; using authoritative legacy path", {
      candidates,
      error,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hotels")
    .select(
      "id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id, config_csv_url, venues_csv_url, i18n_csv_url, hotel_setup_csv_url, request_defs_csv_url"
    )
    .or(slugFilter)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${candidates.join("|")}`);
  }

  const result: HotelSheetSources = {
    hotelId: data.id,
    hotelSlug: data.slug,
    publicSlug: data.public_slug,
    isSandbox: data.is_sandbox ?? false,
    productionHotelId: data.production_hotel_id ?? null,
    hotelName: data.name,
    hotelTimezone: data.timezone,
    configUrl: data.config_csv_url ?? null,
    venuesUrl: data.venues_csv_url ?? null,
    i18nUrl: data.i18n_csv_url ?? null,
    hotelSetupUrl: data.hotel_setup_csv_url ?? null,
    requestDefsUrl: data.request_defs_csv_url ?? null,
  };
  await cacheHotelSheetSources(cacheKey, result);
  return result;
}
