import { getCache } from "@vercel/functions";
import {
  buildHotelSlugOrFilter,
  getHotelSlugCandidates,
} from "@/lib/hotels/hotel-slug.mjs";
import {
  getPrimedFactoryRuntimeBySlug,
  resolveFactoryGuestScopeFastPath,
  type FactoryGuestRuntime,
} from "@/lib/server/factory-guest-context";
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
  factorySandboxAcceptanceCertified?: boolean | null;
};

const hotelSheetSourcesCache = getCache({ namespace: "hotel-sheet-sources-v1" });
const HOTEL_SHEET_SOURCES_TTL_SECONDS = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Prime only process-local runtime caches from the already-authoritative
 * materialized tenant snapshot. Persisted Vercel cache writes here used to
 * multiply one Sandbox lookup into several remote writes before the request
 * could continue, defeating the purpose of the materialized runtime under a
 * cold 100-hotel burst. Legacy/fallback loaders still own their persisted cache
 * writes when the materializer is unavailable.
 */
async function primeSharedRuntimeCaches(runtime: MaterializedTenantRuntime) {
  const hotelId = String(runtime.hotelId || "").trim();
  const revisionId = String(runtime.publishedRevisionId || "").trim();
  const sourceChecksum = String(runtime.sourceChecksum || "").trim().toLowerCase();
  if (
    !hotelId ||
    !revisionId ||
    !/^[a-f0-9]{64}$/.test(sourceChecksum) ||
    !isObject(runtime.config)
  ) {
    return;
  }

  try {
    const [publishedRuntime, normalizedRuntime, testRoomRuntime] = await Promise.all([
      import("@/lib/server/published-hotel-config"),
      import("@/lib/server/normalized-config-runtime"),
      import("@/lib/server/test-rooms"),
    ]);

    const results = await Promise.allSettled([
      publishedRuntime.primePublishedHotelConfigRuntimeCache({
        hotelId,
        revisionId,
        sourceChecksum,
        config: runtime.config,
        relationalAuthority: isObject(runtime.relationalAuthority)
          ? runtime.relationalAuthority
          : null,
        factorySandboxAcceptanceCertified:
          runtime.factorySandboxAcceptanceCertified === true,
      }),
      normalizedRuntime.primeNormalizedRuntimeCachesFromMaterialized({
        hotelId,
        revisionId,
        sourceChecksum,
        config: runtime.config,
        relationalAuthority: isObject(runtime.relationalAuthority)
          ? runtime.relationalAuthority
          : null,
      }),
      Promise.resolve(
        testRoomRuntime.primeActiveTestRoomNumbersRuntimeCache(
          [
            hotelId,
            String(runtime.productionHotelId || "").trim() || null,
          ],
          Array.isArray(runtime.testRoomNumbers) ? runtime.testRoomNumbers : [],
        ),
      ),
    ]);

    if (results.some((result) => result.status === "rejected")) {
      console.warn("Shared materialized tenant runtime process-cache priming was partially unavailable", {
        hotelId,
        revisionId,
      });
    }
  } catch (error) {
    console.warn("Shared materialized tenant runtime process-cache priming was unavailable", {
      hotelId,
      revisionId,
      error,
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
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find"));
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
    // Only the certification marker may opt a Sandbox revision into Factory
    // automatic reconciliation. Slug patterns and generic Sandbox status are not
    // authority and must never force a legacy/manual Sandbox into Factory flow.
    if (runtime.factorySandboxAcceptanceCertified !== true) {
      return null;
    }

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

function directoryFromMaterialized(
  materialized: MaterializedTenantRuntime,
): HotelSheetSources {
  return {
    hotelId: String(materialized.hotelId),
    hotelSlug: String(materialized.hotelSlug),
    publicSlug: materialized.publicSlug ?? null,
    isSandbox: true,
    productionHotelId: materialized.productionHotelId ?? null,
    hotelName:
      materialized.hotelName ?? String(materialized.config?.hotelName || ""),
    hotelTimezone:
      materialized.hotelTimezone ??
      String(materialized.config?.hotelTimezone || ""),
    configUrl: materialized.configUrl ?? null,
    venuesUrl: materialized.venuesUrl ?? null,
    i18nUrl: materialized.i18nUrl ?? null,
    hotelSetupUrl: materialized.hotelSetupUrl ?? null,
    requestDefsUrl: materialized.requestDefsUrl ?? null,
  };
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

  // A guest-write scope RPC may already have returned the complete certified
  // materialized runtime. Reuse it inside the same process instead of paying a
  // second runtime RPC before getHotelConfig can continue.
  let primedRuntime: FactoryGuestRuntime | null = null;
  for (const candidate of candidates) {
    primedRuntime = getPrimedFactoryRuntimeBySlug(candidate);
    if (primedRuntime) break;
  }
  if (!primedRuntime) {
    const fastScope = await resolveFactoryGuestScopeFastPath(inputSlug ?? "");
    primedRuntime = fastScope?.runtime ?? null;
  }
  if (primedRuntime) {
    await primeSharedRuntimeCaches(primedRuntime);
    return directoryFromMaterialized(primedRuntime);
  }

  const slugFilter = buildHotelSlugOrFilter(candidates);
  const cacheKey = `slug:${candidates.join("|")}`;
  let cachedDirectory: HotelSheetSources | null = null;
  try {
    const cached = await hotelSheetSourcesCache.get(cacheKey) as HotelSheetSources | null;
    if (cached?.hotelId && cached.hotelSlug) {
      if (cached.isSandbox !== true) return cached;
      cachedDirectory = cached;
    }
  } catch (error) {
    console.warn("Hotel directory cache read failed; using authoritative database path", { candidates, error });
  }

  // Sandbox directory identity is cacheable, but runtime health is not implied by
  // that cache entry. Always ask the authoritative materialized-runtime contract
  // before returning a cached Sandbox directory so a stale derived projection can
  // reconcile before strict relational authority is attached.
  try {
    const materialized = await resolveMaterializedSandboxRuntime(candidates);
    if (materialized) {
      const result = directoryFromMaterialized(materialized);
      // The materialized RPC already returned the canonical directory + runtime.
      // Prime only process-local consumers and return immediately; persisted
      // directory/runtime caches are legacy resilience, not a prerequisite for
      // serving a certified Sandbox request.
      await primeSharedRuntimeCaches(materialized);
      return result;
    }
  } catch (error) {
    console.warn("Shared Sandbox tenant runtime bootstrap failed; using authoritative legacy path", {
      candidates,
      error,
    });
  }

  if (cachedDirectory) return cachedDirectory;

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
