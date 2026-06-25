import "server-only";

function sanitizeSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

export function getPublicHotelAlias(input: {
  slug?: string | null;
  public_slug?: string | null;
}) {
  const publicSlug = sanitizeSlug(input.public_slug);
  if (publicSlug) return publicSlug;

  const slug = sanitizeSlug(input.slug);

  // Compatibility bridge for the original Aquamarine DB slug.
  if (slug === "aquamarin") return "aquamarine";
  if (slug === "aquamarin-test") return "aquamarine-test";

  return slug;
}
