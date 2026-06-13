import type { AiHotelCatalog } from "@/lib/ai/types";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  value?: AiHotelCatalog;
  pending?: Promise<AiHotelCatalog>;
};

const catalogCache = new Map<string, CacheEntry>();

export async function getCachedCatalog(
  hotelSlug: string,
  loader: () => Promise<AiHotelCatalog>,
  ttlMs = DEFAULT_TTL_MS
): Promise<{ catalog: AiHotelCatalog; cacheHit: boolean }> {
  const key = hotelSlug.trim().toLowerCase();
  const now = Date.now();
  const current = catalogCache.get(key);

  if (current?.value && current.expiresAt > now) {
    return { catalog: current.value, cacheHit: true };
  }

  if (current?.pending) {
    return { catalog: await current.pending, cacheHit: true };
  }

  const pending = loader()
    .then((value) => {
      catalogCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      catalogCache.delete(key);
      throw error;
    });

  catalogCache.set(key, { expiresAt: now + ttlMs, pending });
  return { catalog: await pending, cacheHit: false };
}

export function clearCatalogCache(hotelSlug?: string) {
  if (hotelSlug) catalogCache.delete(hotelSlug.trim().toLowerCase());
  else catalogCache.clear();
}
