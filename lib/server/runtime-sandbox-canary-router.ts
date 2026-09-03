import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const CANARY_PRESENCE_TTL_MS = 750;
const ROUTE_FORWARD_TIMEOUT_MS = 8_000;
const CLOCK_SKEW_SECONDS = 30;
const EXPECTED_VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "team_3XjEa4JGz8DWSWIW3RqauJYA";
const EXPECTED_VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_KUkOL6tRgwxr0QD9tc1TVClCdf9Y";
const EXPECTED_VERCEL_PROJECT_NAME = "hotel-guest-hub";

export type SandboxCanaryRoute = {
  hotelId: string;
  hotelSlug: string;
  publicSlug: string | null;
  cellId: string;
  cellKey: string;
  cellVersion: number;
  targetKey: string;
  targetGeneration: number;
  targetClass: string;
  provider: string;
  computeRef: string;
  dataRef: string;
  region: string | null;
  verificationEvidenceId: number;
  verificationEvidenceRef: string;
  verificationValidUntil: string;
  trafficLeaseEvidenceId: number;
  trafficLeaseValidUntil: string;
  routeValidUntil: string;
};

type HotelRoutingScope = {
  id: string;
  slug: string;
  is_sandbox?: boolean | null;
};

type RouteRpcRow = {
  hotel_id: string;
  hotel_slug: string;
  public_slug: string | null;
  cell_id: string;
  cell_key: string;
  cell_version: number | string;
  target_key: string;
  target_generation: number | string;
  target_class: string;
  provider: string;
  compute_ref: string;
  data_ref: string;
  region: string | null;
  verification_evidence_id: number | string;
  verification_evidence_ref: string;
  verification_valid_until: string;
  traffic_lease_evidence_id: number | string;
  traffic_lease_valid_until: string;
  route_valid_until: string;
};

type VercelOidcHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type VercelOidcPayload = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  iat?: unknown;
  nbf?: unknown;
  exp?: unknown;
  owner?: unknown;
  owner_id?: unknown;
  project?: unknown;
  project_id?: unknown;
  environment?: unknown;
};

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

type JwksDocument = { keys?: Jwk[] };

let canaryPresenceCache:
  | { expiresAt: number; promise: Promise<boolean> }
  | null = null;

const jwksCache = new Map<string, { expiresAt: number; keys: Jwk[] }>();

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function parseJwtPart<T>(value: string): T | null {
  try {
    return JSON.parse(base64UrlDecode(value).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function currentRequestOrigin(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}`.toLowerCase();
}

function parseAllowedComputeOrigin(computeRef: string) {
  let url: URL;
  try {
    url = new URL(String(computeRef || "").trim());
  } catch {
    throw new Error("RUNTIME_CANARY_COMPUTE_REF_INVALID");
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHost =
    hostname === "stayhub.app" ||
    hostname.endsWith(".stayhub.app") ||
    hostname.endsWith(".vercel.app");

  if (
    url.protocol !== "https:" ||
    !allowedHost ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error("RUNTIME_CANARY_COMPUTE_REF_FORBIDDEN");
  }

  return url.origin.toLowerCase();
}

function mapRoute(row: RouteRpcRow): SandboxCanaryRoute {
  return {
    hotelId: row.hotel_id,
    hotelSlug: row.hotel_slug,
    publicSlug: row.public_slug,
    cellId: row.cell_id,
    cellKey: row.cell_key,
    cellVersion: Number(row.cell_version),
    targetKey: row.target_key,
    targetGeneration: Number(row.target_generation),
    targetClass: row.target_class,
    provider: row.provider,
    computeRef: row.compute_ref,
    dataRef: row.data_ref,
    region: row.region,
    verificationEvidenceId: Number(row.verification_evidence_id),
    verificationEvidenceRef: row.verification_evidence_ref,
    verificationValidUntil: row.verification_valid_until,
    trafficLeaseEvidenceId: Number(row.traffic_lease_evidence_id),
    trafficLeaseValidUntil: row.traffic_lease_valid_until,
    routeValidUntil: row.route_valid_until,
  };
}

async function hasActiveSandboxCanaryTraffic() {
  const now = Date.now();
  if (canaryPresenceCache && canaryPresenceCache.expiresAt > now) {
    return canaryPresenceCache.promise;
  }

  const promise = (async () => {
    const { data, error } = await supabaseAdmin.rpc("has_active_sandbox_canary_traffic_v1");
    if (error) throw new Error(`RUNTIME_CANARY_PRESENCE_FAILED:${error.message}`);
    return data === true;
  })();

  const entry = { expiresAt: now + CANARY_PRESENCE_TTL_MS, promise };
  canaryPresenceCache = entry;
  try {
    return await promise;
  } catch (error) {
    if (canaryPresenceCache === entry) canaryPresenceCache = null;
    throw error;
  }
}

export function clearSandboxCanaryPresenceProcessCache() {
  canaryPresenceCache = null;
}

export async function resolveSandboxCanaryRoute(hotel: HotelRoutingScope) {
  if (!hotel.is_sandbox) return null;
  if (!(await hasActiveSandboxCanaryTraffic())) return null;

  const { data, error } = await supabaseAdmin.rpc("resolve_guest_sandbox_canary_route_v1", {
    p_hotel_id: hotel.id,
  });
  if (error) throw new Error(`RUNTIME_CANARY_ROUTE_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as RouteRpcRow | null;
  if (!row) return null;
  if (row.hotel_id !== hotel.id) throw new Error("RUNTIME_CANARY_ROUTE_HOTEL_MISMATCH");

  return mapRoute(row);
}

async function loadJwks(issuer: string) {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const jwksUrl = new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks`);
  if (jwksUrl.protocol !== "https:" || jwksUrl.hostname !== "oidc.vercel.com") {
    throw new Error("RUNTIME_FORWARD_OIDC_ISSUER_FORBIDDEN");
  }

  const response = await fetch(jwksUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`RUNTIME_FORWARD_OIDC_JWKS_FAILED:${response.status}`);
  const parsed = await response.json() as JwksDocument;
  const keys = Array.isArray(parsed.keys) ? parsed.keys : [];
  if (!keys.length) throw new Error("RUNTIME_FORWARD_OIDC_JWKS_EMPTY");
  jwksCache.set(issuer, { expiresAt: Date.now() + 3_600_000, keys });
  return keys;
}

async function verifyVercelOidcToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("RUNTIME_FORWARD_OIDC_INVALID");

  const header = parseJwtPart<VercelOidcHeader>(parts[0]);
  const payload = parseJwtPart<VercelOidcPayload>(parts[1]);
  if (!header || !payload) throw new Error("RUNTIME_FORWARD_OIDC_INVALID");
  if (asString(header.alg) !== "RS256" || !asString(header.kid)) {
    throw new Error("RUNTIME_FORWARD_OIDC_ALGORITHM_INVALID");
  }

  const owner = asString(payload.owner);
  const project = asString(payload.project);
  const environment = asString(payload.environment);
  const issuer = asString(payload.iss).replace(/\/$/, "");
  const expectedTeamIssuer = owner ? `https://oidc.vercel.com/${owner}` : "";
  if (issuer !== "https://oidc.vercel.com" && issuer !== expectedTeamIssuer) {
    throw new Error("RUNTIME_FORWARD_OIDC_ISSUER_INVALID");
  }
  if (payload.owner_id !== EXPECTED_VERCEL_TEAM_ID || payload.project_id !== EXPECTED_VERCEL_PROJECT_ID) {
    throw new Error("RUNTIME_FORWARD_OIDC_PROJECT_IDENTITY_INVALID");
  }
  if (project !== EXPECTED_VERCEL_PROJECT_NAME || !["production", "preview"].includes(environment)) {
    throw new Error("RUNTIME_FORWARD_OIDC_PROJECT_SCOPE_INVALID");
  }
  if (payload.aud !== `https://vercel.com/${owner}`) {
    throw new Error("RUNTIME_FORWARD_OIDC_AUDIENCE_INVALID");
  }
  if (payload.sub !== `owner:${owner}:project:${project}:environment:${environment}`) {
    throw new Error("RUNTIME_FORWARD_OIDC_SUBJECT_INVALID");
  }

  const now = Math.floor(Date.now() / 1000);
  const nbf = asNumber(payload.nbf);
  const exp = asNumber(payload.exp);
  const iat = asNumber(payload.iat);
  if (nbf === null || exp === null || iat === null) throw new Error("RUNTIME_FORWARD_OIDC_TIME_CLAIMS_INVALID");
  if (nbf > now + CLOCK_SKEW_SECONDS || exp <= now - CLOCK_SKEW_SECONDS || iat > now + CLOCK_SKEW_SECONDS) {
    throw new Error("RUNTIME_FORWARD_OIDC_EXPIRED");
  }

  const keys = await loadJwks(issuer);
  const jwk = keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === "RS256"));
  if (!jwk) throw new Error("RUNTIME_FORWARD_OIDC_KEY_NOT_FOUND");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw new Error("RUNTIME_FORWARD_OIDC_SIGNATURE_INVALID");

  return { owner, project, environment, issuer };
}

async function acceptForwardedRequest(input: {
  req: NextRequest;
  hotel: HotelRoutingScope;
}) {
  if (input.req.headers.get("x-stayhub-runtime-forwarded") !== "v1") return false;

  if (!input.hotel.is_sandbox) throw new Error("RUNTIME_FORWARD_PRODUCTION_FORBIDDEN");

  const authorization = input.req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("RUNTIME_FORWARD_OIDC_REQUIRED");
  await verifyVercelOidcToken(authorization.slice("Bearer ".length).trim());

  const forwardedHotelId = input.req.headers.get("x-stayhub-runtime-hotel-id") || "";
  const targetKey = input.req.headers.get("x-stayhub-runtime-target-key") || "";
  const targetGeneration = Number(input.req.headers.get("x-stayhub-runtime-target-generation") || "0");
  const computeOrigin = String(input.req.headers.get("x-stayhub-runtime-compute-origin") || "").toLowerCase();
  const routeValidUntil = Date.parse(input.req.headers.get("x-stayhub-runtime-route-valid-until") || "");

  if (forwardedHotelId !== input.hotel.id) throw new Error("RUNTIME_FORWARD_HOTEL_MISMATCH");
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(targetKey) || !Number.isSafeInteger(targetGeneration) || targetGeneration < 1) {
    throw new Error("RUNTIME_FORWARD_TARGET_IDENTITY_INVALID");
  }
  if (!Number.isFinite(routeValidUntil) || routeValidUntil <= Date.now()) {
    throw new Error("RUNTIME_FORWARD_ROUTE_LEASE_EXPIRED");
  }
  if (!computeOrigin || computeOrigin !== currentRequestOrigin(input.req)) {
    throw new Error("RUNTIME_FORWARD_COMPUTE_ORIGIN_MISMATCH");
  }

  return true;
}

function forwardedResponse(response: Response, route: SandboxCanaryRoute) {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");
  if (contentType) headers.set("content-type", contentType);
  if (cacheControl) headers.set("cache-control", cacheControl);
  headers.set("x-stayhub-runtime-target", route.targetKey);
  headers.set("x-stayhub-runtime-target-generation", String(route.targetGeneration));
  headers.set("x-stayhub-runtime-cell", route.cellKey);
  headers.set("x-stayhub-runtime-forwarded", "v1");
  return new NextResponse(response.body, { status: response.status, headers });
}

export async function maybeForwardSandboxGuestRequest(input: {
  req: NextRequest;
  hotel: HotelRoutingScope;
  body: unknown;
  routePath: string;
}): Promise<NextResponse | null> {
  const acceptedForward = await acceptForwardedRequest({ req: input.req, hotel: input.hotel });
  if (acceptedForward) return null;
  if (!input.hotel.is_sandbox) return null;

  const route = await resolveSandboxCanaryRoute(input.hotel);
  if (!route) return null;
  if (route.provider !== "stayhub") throw new Error("RUNTIME_CANARY_PROVIDER_UNSUPPORTED");

  const targetOrigin = parseAllowedComputeOrigin(route.computeRef);
  const sourceOrigin = currentRequestOrigin(input.req);
  if (targetOrigin === sourceOrigin) {
    // Same-origin canary is useful for proving the route decision without a
    // network hop. The DB lease and exact generation are still authoritative.
    return null;
  }

  const oidcToken = input.req.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || "";
  if (!oidcToken) throw new Error("RUNTIME_CANARY_FORWARD_OIDC_UNAVAILABLE");

  const url = new URL(input.routePath, `${targetOrigin}/`);
  const response = await fetch(url, {
    method: input.req.method,
    headers: {
      accept: input.req.headers.get("accept") || "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${oidcToken}`,
      "x-stayhub-runtime-forwarded": "v1",
      "x-stayhub-runtime-hotel-id": input.hotel.id,
      "x-stayhub-runtime-target-key": route.targetKey,
      "x-stayhub-runtime-target-generation": String(route.targetGeneration),
      "x-stayhub-runtime-compute-origin": targetOrigin,
      "x-stayhub-runtime-route-valid-until": route.routeValidUntil,
      "x-stayhub-runtime-source-vercel-id": input.req.headers.get("x-vercel-id") || "",
    },
    body: JSON.stringify(input.body ?? null),
    redirect: "error",
    signal: AbortSignal.timeout(ROUTE_FORWARD_TIMEOUT_MS),
    cache: "no-store",
  });

  return forwardedResponse(response, route);
}

export function runtimeCanaryRoutingErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "RUNTIME_CANARY_ROUTING_FAILED");
  const code = message.split(":")[0] || "RUNTIME_CANARY_ROUTING_FAILED";
  return NextResponse.json(
    {
      ok: false,
      error: "Sandbox runtime routing is temporarily unavailable.",
      code,
    },
    {
      status: code.startsWith("RUNTIME_FORWARD_") ? 401 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
