export function canonicalizeLocaleTag(value: unknown): string | null;
export function localeIdentity(value: unknown): string;
export function normalizeLocaleList(values: unknown): string[];
export function findEnabledLocale(value: unknown, enabledLocales: unknown): string | null;
export function resolveEnabledLocale(
  value: unknown,
  enabledLocales: unknown,
  fallbackLocale?: unknown,
): string;
export function getLocaleFallbackOrder(
  value: unknown,
  enabledLocales: unknown,
  fallbackLocale?: unknown,
): string[];
