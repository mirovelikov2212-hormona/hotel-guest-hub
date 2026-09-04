import "server-only";

import { getCache } from "@vercel/functions";

import {
  buildHotelSlugOrFilter,
  getHotelSlugCandidates as getHotelSlugCandidatesCore,
  sanitizeHotelSlug,
} from "@/lib/hotels/hotel-slug.mjs";
import { requireHotelCommercialRuntimeAccess } from "@/lib/server/commercial-runtime-entitlement";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { TestRoomPolicy } from "@/lib/server/test-rooms";

export type HotelScope = {
  id: string;
  slug: string;
  public_slug?: string | null;
  name?: string | null;
  timezone?: string | null;
  active?: boolean | null;
  is_sandbox?: boolean | null;
  production_hotel_id?: string | null;
};

const hotelScopeCache = getCache({ namespace: "hotel-scope-v1" });
const HOTEL_SCOPE_TTL_SECONDS = 300;

export async function expireHotelScopeCache(hotelId: string) {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) return;
  await hotelScopeCache.expireTag(`hotel-directory:${normalizedHotelId}`);
}

function sanitizeSlug(value: unknown) {
  return sanitizeHotelSlug(value);
}

export function getHotelSlugCandidates(inputSlug: string): string[] {
  return getHotelSlugCandidatesCore(inputSlug);
}

function buildSlugOrFilter(candidates: string[]) {
  return buildHotelSlugOrFilter(candidates);
}

async function requireCommercialAccessWhenApplicable(hotel: HotelScope) {
  // Sandbox is an explicit non-production runtime. The commercial entitlement
  // resolver itself returns non_production_bypass for this environment, so a
  // second RPC on every Sandbox guest operation cannot change the decision.
  // Production remains fail-closed exactly as before.
  if (hotel.is_sandbox === true) return;
  await requireHotelCommercialRuntimeAccess(hotel.id);
}

export async function resolveHotelByAnySlugAdmin(inputSlug: string): Promise<HotelScope> {
  const candidates = getHotelSlugCandidates(inputSlug);

  if (!candidates.length) {
    throw new Error("Missing hotel slug");
  }

  const cacheKey = `slug:${candidates.join("|")}`;
  try {
    const cached = await hotelScopeCache.get(cacheKey) as HotelScope | null;
    if (cached?.id && cached.slug) {
      await requireCommercialAccessWhenApplicable(cached);
      return cached;
    }
  } catch (error) {
    console.warn("Hotel scope cache read failed; using authoritative database path", { candidates, error });
  }

  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id")
    .or(buildSlugOrFilter(candidates))
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Hotel not found for slug: ${candidates.join("|")}`);
  }

  const hotel = data as HotelScope;
  await requireCommercialAccessWhenApplicable(hotel);
  try {
    await hotelScopeCache.set(cacheKey, hotel, {
      ttl: HOTEL_SCOPE_TTL_SECONDS,
      tags: ["hotel-directory", `hotel-directory:${hotel.id}`],
      name: "hotel-scope",
    });
  } catch (cacheError) {
    console.warn("Hotel scope cache write failed; continuing with authoritative result", { hotelId: hotel.id, cacheError });
  }
  return hotel;
}

export function hotelMatchesRequestedSlug(hotel: Pick<HotelScope, "slug" | "public_slug">, inputSlug: string) {
  const candidates = getHotelSlugCandidates(inputSlug);
  const canonicalSlug = sanitizeSlug(hotel.slug);
  const publicSlug = sanitizeSlug(hotel.public_slug);

  return candidates.includes(canonicalSlug) || (!!publicSlug && candidates.includes(publicSlug));
}

export function isSandboxHotel(hotel: Pick<HotelScope, "is_sandbox"> | null | undefined) {
  return Boolean(hotel?.is_sandbox);
}

export function getOperationalIsolationFields(input: {
  hotel: Pick<HotelScope, "slug" | "is_sandbox" | "production_hotel_id">;
  testRoomPolicy: TestRoomPolicy;
}) {
  const sandbox = isSandboxHotel(input.hotel);

  if (sandbox) {
    return {
      is_test: true,
      test_expires_at: null,
    };
  }

  return {
    is_test: input.testRoomPolicy.isTest,
    test_expires_at: input.testRoomPolicy.expiresAt,
  };
}

export function getOperationalIsolationMetadata(input: {
  hotel: Pick<HotelScope, "slug" | "is_sandbox" | "production_hotel_id">;
  testRoomPolicy: TestRoomPolicy;
}) {
  const sandbox = isSandboxHotel(input.hotel);

  if (sandbox) {
    return {
      isTest: true,
      isSandbox: true,
      sandboxHotelSlug: input.hotel.slug,
      productionHotelId: input.hotel.production_hotel_id ?? null,
    };
  }

  if (!input.testRoomPolicy.isTest) return { isTest: false };

  return {
    isTest: true,
    testAutoDeleteAfterSeconds: input.testRoomPolicy.autoDeleteAfterSeconds,
    testExpiresAt: input.testRoomPolicy.expiresAt,
  };
}

export function shouldSuppressLivePush(input: {
  hotel: Pick<HotelScope, "is_sandbox">;
  testRoomPolicy?: TestRoomPolicy | null;
}) {
  return isSandboxHotel(input.hotel) || Boolean(input.testRoomPolicy?.isTest);
}
