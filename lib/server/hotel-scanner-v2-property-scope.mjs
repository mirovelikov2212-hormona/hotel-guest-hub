const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu;
const GENERIC_PROPERTY_CONTAINER = /^(?:hotel|hotels|resort|resorts|property|properties|otel|oteller|tesis|tesislər|hotele|hoteli)$/iu;
const GENERIC_IDENTITY_TOKEN = /^(?:hotel|hotels|resort|resorts|property|properties|premium|collection|group|otel|oteller|tesis)$/iu;

function clean(value, max = 2048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function canonical(rawUrl) {
  try {
    const url = new URL(clean(rawUrl));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function pathSegments(rawUrl) {
  try {
    return decodeURIComponent(new URL(canonical(rawUrl)).pathname)
      .split("/")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function semanticSegments(rawUrl) {
  return pathSegments(rawUrl).filter((segment) => !LANGUAGE_SEGMENT.test(segment));
}

function normalizeSegment(value) {
  return clean(value, 240)
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function identityTokens(segments) {
  return [...new Set(
    segments
      .flatMap((segment) => normalizeSegment(segment).split("-"))
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !GENERIC_IDENTITY_TOKEN.test(token)),
  )];
}

export function deriveHotelPropertyScopeV2(requestedUrl, canonicalUrl = "") {
  const requested = canonical(requestedUrl);
  const resolved = canonical(canonicalUrl) || requested;
  const base = resolved || requested;
  if (!base) return { mode: "ORIGIN", origin: "", rootSegments: [], rootPath: "/", identityTokens: [] };

  const requestedSemantic = semanticSegments(requested);
  const resolvedSemantic = semanticSegments(resolved);
  let sourceSegments = requestedSemantic.length ? requestedSemantic : resolvedSemantic;

  if (!sourceSegments.length) {
    return {
      mode: "ORIGIN",
      origin: new URL(base).origin,
      rootSegments: [],
      rootPath: "/",
      identityTokens: [],
    };
  }

  let rootSegments = [sourceSegments[0]];
  if (GENERIC_PROPERTY_CONTAINER.test(sourceSegments[0]) && sourceSegments[1]) {
    rootSegments = sourceSegments.slice(0, 2);
  }

  const normalizedRoot = rootSegments.map(normalizeSegment).filter(Boolean);
  const tokens = identityTokens(normalizedRoot);
  const propertySegment = normalizedRoot[normalizedRoot.length - 1] || "";
  const propertyTokens = identityTokens([propertySegment]);

  return {
    mode: normalizedRoot.length ? "PATH_ROOT" : "ORIGIN",
    origin: new URL(base).origin,
    rootSegments: normalizedRoot,
    rootPath: normalizedRoot.length ? `/${normalizedRoot.join("/")}` : "/",
    identityTokens: tokens,
    primaryIdentityToken: propertyTokens[0] || tokens[0] || "",
  };
}

function normalizedSemanticSegments(rawUrl) {
  return semanticSegments(rawUrl).map(normalizeSegment).filter(Boolean);
}

const EDITORIAL_SECTION_SEGMENT = /^(?:news|blog|blogs|article|articles|stories|story|press|media|haber|haberler|nachricht|nachrichten|actualites|nouvelles|novosti|новини|новости|guide|guides|travel-guide|reisefuhrer|ratgeber)$/iu;

export function isLikelyHotelEditorialUrlV2(rawUrl) {
  const segments = normalizedSemanticSegments(rawUrl);
  if (!segments.length) return false;

  if (segments.some((segment) => EDITORIAL_SECTION_SEGMENT.test(segment))) return true;

  const slug = segments[segments.length - 1] || "";
  const tokens = slug.split("-").filter(Boolean);
  const hasYear = tokens.some((token) => /^20\d{2}$/u.test(token));

  // Hotel object/detail slugs are normally short and noun-like. Long prose
  // slugs are a strong CMS article/SEO signal across languages.
  if (tokens.length >= 9) return true;
  if (hasYear && tokens.length >= 6) return true;

  return false;
}

export function isHotelPropertyOperationalContentUrlV2(rawUrl, scope = {}) {
  if (!isHotelPropertyPageUrlInScopeV2(rawUrl, scope)) return false;

  const candidate = normalizedSemanticSegments(rawUrl);
  const root = Array.isArray(scope.rootSegments) ? scope.rootSegments : [];
  if (root.length && candidate.length === root.length
    && root.every((segment, index) => candidate[index] === segment)) {
    return true;
  }

  return !isLikelyHotelEditorialUrlV2(rawUrl);
}


export function isHotelPropertyPageUrlInScopeV2(rawUrl, scope = {}) {
  const url = canonical(rawUrl);
  if (!url) return false;

  try {
    if (scope.origin && new URL(url).origin !== scope.origin) return false;
  } catch {
    return false;
  }

  if (scope.mode !== "PATH_ROOT" || !Array.isArray(scope.rootSegments) || !scope.rootSegments.length) {
    return true;
  }

  const candidate = normalizedSemanticSegments(url);
  if (candidate.length < scope.rootSegments.length) return false;
  return scope.rootSegments.every((segment, index) => candidate[index] === segment);
}

export function isHotelPropertyDocumentUrlInScopeV2(rawUrl, scope = {}, options = {}) {
  if (isHotelPropertyPageUrlInScopeV2(rawUrl, scope)) return true;
  const url = canonical(rawUrl);
  if (!url) return false;

  try {
    if (scope.origin && new URL(url).origin !== scope.origin) return false;
  } catch {
    return false;
  }

  if (options.directlyLinkedFromProperty === true) return true;
  if (scope.mode !== "PATH_ROOT") return true;

  const haystack = normalizedSemanticSegments(url).join(" ");
  const primary = clean(scope.primaryIdentityToken, 120);
  if (primary && primary.length >= 4) return haystack.includes(primary);

  const tokens = Array.isArray(scope.identityTokens) ? scope.identityTokens : [];
  return tokens.length === 1 && tokens[0].length >= 4 && haystack.includes(tokens[0]);
}

export function filterHotelPropertyPageUrlsV2(values = [], scope = {}) {
  return [...new Set((values || []).map(canonical).filter((url) => url && isHotelPropertyPageUrlInScopeV2(url, scope)))];
}
