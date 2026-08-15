export function sanitizeHotelSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

export function getHotelSlugCandidates(inputSlug) {
  const slug = sanitizeHotelSlug(inputSlug);
  return slug ? [slug] : [];
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
