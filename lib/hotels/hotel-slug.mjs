const LEGACY_ALIAS_GROUPS = [
  ["aquamarine", "aquamarin"],
  ["aquamarine-test", "aquamarin-test"],
];

export function sanitizeHotelSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

export function getHotelSlugCandidates(inputSlug) {
  const slug = sanitizeHotelSlug(inputSlug);
  const candidates = new Set();
  if (slug) candidates.add(slug);

  for (const aliases of LEGACY_ALIAS_GROUPS) {
    if (!aliases.includes(slug)) continue;
    for (const alias of aliases) candidates.add(alias);
  }

  return Array.from(candidates).filter(Boolean);
}

export function buildHotelSlugOrFilter(candidates) {
  const safe = Array.from(
    new Set((candidates || []).map(sanitizeHotelSlug).filter(Boolean)),
  );

  return [
    ...safe.map((slug) => `slug.eq.${slug}`),
    ...safe.map((slug) => `public_slug.eq.${slug}`),
  ].join(",");
}
