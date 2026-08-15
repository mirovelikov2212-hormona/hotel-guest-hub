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
  return sanitizeSlug(input.public_slug) || sanitizeSlug(input.slug);
}
