function text(value) {
  return String(value ?? "").trim();
}

export function canonicalizeLocaleTag(value) {
  const raw = text(value);
  if (!raw) return null;

  try {
    const [canonical] = Intl.getCanonicalLocales(raw);
    return canonical || null;
  } catch {
    return null;
  }
}

export function localeIdentity(value) {
  const canonical = canonicalizeLocaleTag(value);
  return canonical ? canonical.toLowerCase() : "";
}

export function normalizeLocaleList(values) {
  const out = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const canonical = canonicalizeLocaleTag(value);
    if (!canonical) continue;
    const identity = canonical.toLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(canonical);
  }

  return out;
}

export function findEnabledLocale(value, enabledLocales) {
  const enabled = normalizeLocaleList(enabledLocales);
  if (!enabled.length) return null;

  const candidate = canonicalizeLocaleTag(value);
  if (!candidate) return null;

  const exactIdentity = candidate.toLowerCase();
  const exact = enabled.find((item) => item.toLowerCase() === exactIdentity);
  if (exact) return exact;

  const base = candidate.split("-")[0].toLowerCase();
  const exactBase = enabled.find((item) => item.toLowerCase() === base);
  if (exactBase) return exactBase;

  return (
    enabled.find((item) => item.split("-")[0].toLowerCase() === base) || null
  );
}

export function resolveEnabledLocale(value, enabledLocales, fallbackLocale) {
  const enabled = normalizeLocaleList(enabledLocales);
  const matched = findEnabledLocale(value, enabled);
  if (matched) return matched;

  const fallback = findEnabledLocale(fallbackLocale, enabled);
  if (fallback) return fallback;

  return enabled[0] || canonicalizeLocaleTag(fallbackLocale) || "en";
}

export function getLocaleFallbackOrder(value, enabledLocales, fallbackLocale) {
  const enabled = normalizeLocaleList(enabledLocales);
  const current = resolveEnabledLocale(value, enabled, fallbackLocale);
  const fallback = resolveEnabledLocale(fallbackLocale, enabled, enabled[0] || "en");
  const currentBase = current.split("-")[0];

  const candidates = [
    current,
    enabled.find((item) => item.toLowerCase() === currentBase.toLowerCase()),
    fallback,
    enabled.find((item) => item.toLowerCase() === "en"),
  ].filter(Boolean);

  const seen = new Set();
  return candidates.filter((item) => {
    const identity = String(item).toLowerCase();
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
