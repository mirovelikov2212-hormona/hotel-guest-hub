const DETAIL_BASES = new Set([
  "deterministic_detail_resource",
  "canonical_detail_entity",
  "canonical_linked_detail_entity",
]);

function clean(value, max = 2048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ").trim();
}

function sameEntityName(left, right) {
  const a = entityKey(left);
  const b = entityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 7) return false;
  return a.includes(b) || b.includes(a);
}

function canonicalUrl(rawUrl) {
  try {
    const url = new URL(clean(rawUrl));
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return "";
  }
}

function urlDescendsFrom(candidateUrl, parentUrl) {
  const candidate = canonicalUrl(candidateUrl);
  const parent = canonicalUrl(parentUrl);
  if (!candidate || !parent || candidate === parent) return false;
  try {
    const child = new URL(candidate);
    const ancestor = new URL(parent);
    if (child.origin !== ancestor.origin) return false;
    const parentPath = ancestor.pathname.replace(/\/+$/, "");
    return Boolean(parentPath && parentPath !== "/" && child.pathname.startsWith(`${parentPath}/`));
  } catch {
    return false;
  }
}

function itemUrls(item) {
  return [...new Set([item?.url, ...(Array.isArray(item?.urls) ? item.urls : [])]
    .map(canonicalUrl)
    .filter(Boolean))];
}

function factUrls(fact) {
  return [...new Set((Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : [])
    .map(canonicalUrl)
    .filter(Boolean))];
}

function factEntity(fact) {
  const subject = entityKey(fact?.subject);
  if (subject && !["hotel", "resort", "property"].includes(subject)) return subject;
  const attribute = clean(fact?.attribute, 80).toLocaleLowerCase("en-US");
  if (["room_type", "venue", "service", "treatment", "treatment_category", "facility", "technology", "equipment", "amenity", "experience", "activity", "attraction", "offer", "event"].includes(attribute)) {
    return entityKey(fact?.value);
  }
  return "";
}

function chooseOwner(candidates, fact) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const entity = factEntity(fact);
  if (entity) {
    const matches = candidates.filter((item) => sameEntityName(item?.nameHint, entity));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export function resolveHotelScannerFactOwnerV2(fact, expectedItems = []) {
  const sources = factUrls(fact);
  const items = (Array.isArray(expectedItems) ? expectedItems : [])
    .filter((item) => clean(item?.nameHint, 240));

  const exact = items.filter((item) => {
    const urls = itemUrls(item);
    return sources.some((source) => urls.includes(source));
  });
  const exactOwner = chooseOwner(exact, fact);
  if (exactOwner) return { owner: exactOwner, matchKind: "EXACT", ambiguous: false };
  if (exact.length > 1) return { owner: null, matchKind: "EXACT", ambiguous: true };

  const descendants = [];
  for (const item of items) {
    if (!DETAIL_BASES.has(clean(item?.basis, 80))) continue;
    const parent = canonicalUrl(item?.url);
    if (!parent) continue;
    if (sources.some((source) => urlDescendsFrom(source, parent))) {
      let depth = 0;
      try { depth = new URL(parent).pathname.split("/").filter(Boolean).length; } catch {}
      descendants.push({ item, depth });
    }
  }
  if (!descendants.length) return { owner: null, matchKind: "NONE", ambiguous: false };

  const maxDepth = Math.max(...descendants.map((entry) => entry.depth));
  const mostSpecific = descendants.filter((entry) => entry.depth === maxDepth).map((entry) => entry.item);
  const owner = chooseOwner(mostSpecific, fact);
  return owner
    ? { owner, matchKind: "DESCENDANT", ambiguous: false }
    : { owner: null, matchKind: "DESCENDANT", ambiguous: mostSpecific.length > 1 };
}

export function bindHotelScannerFactToOwnerV2(fact, expectedItems = []) {
  const ownership = resolveHotelScannerFactOwnerV2(fact, expectedItems);
  if (!ownership.owner) return { fact, ...ownership };

  const ownerName = clean(ownership.owner?.nameHint, 160);
  return {
    ...ownership,
    fact: ownerName ? { ...fact, subject: ownerName } : fact,
  };
}
