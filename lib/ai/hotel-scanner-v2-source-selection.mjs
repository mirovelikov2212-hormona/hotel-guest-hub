const LANGUAGE_PREFIX = /^(?:bg|en|de|ro|mk|ru|cs|cz|fr|it|es|pl|tr|el|sr|uk|hu|nl|pt)$/iu;

function clean(value, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function localeOf(rawUrl) {
  try {
    const parts = new URL(clean(rawUrl)).pathname.split("/").filter(Boolean);
    return parts.length && LANGUAGE_PREFIX.test(parts[0]) ? parts[0].toLocaleLowerCase("en-US") : "";
  } catch {
    return "";
  }
}

function logicalPageKey(rawUrl) {
  try {
    const url = new URL(clean(rawUrl));
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length && LANGUAGE_PREFIX.test(parts[0])) parts.shift();
    const path = `/${parts.join("/")}`.replace(/\/+$/, "") || "/";
    return `${url.origin}${path}`;
  } catch {
    return clean(rawUrl);
  }
}

function preferredLocale(canonicalUrl) {
  return localeOf(canonicalUrl);
}

function sourceRank(resource, preferred) {
  const locale = localeOf(resource?.url);
  let score = resource?.crawled ? 1_000 : 0;
  if (preferred) {
    if (locale === preferred) score += 300;
    else if (!locale) score += 220;
    else if (locale === "en") score += 140;
    else score += 80;
  } else {
    if (!locale) score += 320;
    else if (locale === "bg") score += 220;
    else if (locale === "en") score += 180;
    else score += 80;
  }
  if (clean(resource?.canonicalTarget) && clean(resource?.canonicalTarget) === clean(resource?.url)) score += 25;
  score -= Math.min(100, clean(resource?.url).length / 10);
  return score;
}

function chooseRepresentative(resources, preferred) {
  return [...resources].sort((left, right) => {
    const rank = sourceRank(right, preferred) - sourceRank(left, preferred);
    if (rank) return rank;
    return clean(left?.url).localeCompare(clean(right?.url));
  })[0];
}

export function selectHotelScannerPrimaryPageUrlsV2(siteMap, candidateUrls = [], canonicalUrl = "") {
  const allowed = new Set((candidateUrls || []).map((value) => clean(value)).filter(Boolean));
  const resources = (Array.isArray(siteMap?.resources) ? siteMap.resources : [])
    .filter((resource) => resource?.resourceType !== "pdf" && allowed.has(clean(resource?.url)));
  const byGroup = new Map();

  for (const resource of resources) {
    const groupId = clean(resource?.variantGroupId, 500) || logicalPageKey(resource?.url);
    if (!groupId) continue;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(resource);
  }

  const preferred = preferredLocale(canonicalUrl);
  const selected = [];
  const selectedUrls = new Set();
  for (const group of byGroup.values()) {
    const representative = chooseRepresentative(group, preferred);
    const url = clean(representative?.url);
    if (url && !selectedUrls.has(url)) {
      selectedUrls.add(url);
      selected.push(url);
    }
  }

  // Preserve candidate URLs that are not represented in Site Map metadata.
  // This keeps the selector fail-open for unusual CMS surfaces while still
  // collapsing known language variants deterministically.
  for (const url of allowed) {
    const known = resources.some((resource) => clean(resource?.url) === url);
    if (!known && !selectedUrls.has(url)) {
      selectedUrls.add(url);
      selected.push(url);
    }
  }

  return selected.sort();
}

export function hotelScannerLogicalPageKeyV2(rawUrl) {
  return logicalPageKey(rawUrl);
}
