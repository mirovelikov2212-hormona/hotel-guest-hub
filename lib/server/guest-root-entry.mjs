const MAIN_STAYHUB_HOSTS = new Set(["stayhub.app", "www.stayhub.app", "localhost"]);

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().split(":")[0];
}

function normalizeSlug(value, fallback) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : fallback;
}

/**
 * Resolve only the root-entry destination. Hotel runtime authority still lives
 * in the normal /h/[hotelSlug] route and the relational hotel/room registries.
 *
 * Vercel Preview must never default into the public demo tenant because Preview
 * writes are QA traffic and must be isolated in a configured sandbox tenant.
 */
export function resolveGuestRootEntry({
  host,
  vercelEnv,
  previewHotelSlug,
} = {}) {
  const normalizedHost = normalizeHost(host);

  if (!MAIN_STAYHUB_HOSTS.has(normalizedHost) && normalizedHost.endsWith(".stayhub.app")) {
    const subdomain = normalizedHost.slice(0, -".stayhub.app".length).trim();
    if (subdomain) return `/h/${normalizeSlug(subdomain, "demo")}`;
  }

  if (String(vercelEnv || "").trim().toLowerCase() === "preview") {
    return `/h/${normalizeSlug(previewHotelSlug, "aquamarine-test")}`;
  }

  return "/h/demo";
}
