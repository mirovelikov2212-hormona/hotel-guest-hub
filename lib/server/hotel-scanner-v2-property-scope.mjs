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
  return {
    mode: normalizedRoot.length ? "PATH_ROOT" : "ORIGIN",
    origin: new URL(base).origin,
    rootSegments: normalizedRoot,
    rootPath: normalizedRoot.length ? `/${normalizedRoot.join("/")}` : "/",
    identityTokens: identityTokens(normalizedRoot),
  };
}

function normalizedSemanticSegments(rawUrl) {
  return semanticSegments(rawUrl).map(normalizeSegment).filter(Boolean);
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
  const tokens = Array.isArray(scope.identityTokens) ? scope.identityTokens : [];
  return tokens.some((token) => token.length >= 4 && haystack.includes(token));
}

export function filterHotelPropertyPageUrlsV2(values = [], scope = {}) {
  return [...new Set((values || []).map(canonical).filter((url) => url && isHotelPropertyPageUrlInScopeV2(url, scope)))];
}
