import { NextRequest, NextResponse } from "next/server";

import { isValidIanaTimezone } from "@/lib/product-factory/factory-blueprint-model.mjs";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 240;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type GoogleGeocodingResult = {
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
};

type OpenMeteoGeocodingResult = {
  name?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  country_code?: string;
  country?: string;
  admin1?: string;
};

type ResolvedLocation = {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  countryCode: string;
  provider: "google_maps" | "open_meteo";
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function finiteCoordinate(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function openMeteoEndpoint(kind: "geocoding" | "forecast") {
  const commercialApiKey = String(process.env.OPEN_METEO_API_KEY || "").trim();
  if (kind === "geocoding") {
    return commercialApiKey
      ? "https://customer-geocoding-api.open-meteo.com/v1/search"
      : "https://geocoding-api.open-meteo.com/v1/search";
  }
  return commercialApiKey
    ? "https://customer-api.open-meteo.com/v1/forecast"
    : "https://api.open-meteo.com/v1/forecast";
}

function appendOpenMeteoApiKey(url: URL) {
  const commercialApiKey = String(process.env.OPEN_METEO_API_KEY || "").trim();
  if (commercialApiKey) url.searchParams.set("apikey", commercialApiKey);
}

async function fetchProviderJson(url: URL) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`FACTORY_LOCATION_PROVIDER_HTTP_${response.status}`);
  return await response.json();
}

async function resolveTimezoneFromCoordinates(latitude: number, longitude: number) {
  const url = new URL(openMeteoEndpoint("forecast"));
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");
  appendOpenMeteoApiKey(url);

  const payload = await fetchProviderJson(url);
  const timezone = String(payload?.timezone || "").trim();
  return isValidIanaTimezone(timezone) ? timezone : null;
}

async function resolveWithGoogle(query: string, countryCode: string): Promise<ResolvedLocation | null> {
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", `country:${countryCode}`);
  url.searchParams.set("key", apiKey);

  try {
    const payload = await fetchProviderJson(url);
    const result = (Array.isArray(payload?.results) ? payload.results[0] : null) as GoogleGeocodingResult | null;
    const latitude = finiteCoordinate(result?.geometry?.location?.lat);
    const longitude = finiteCoordinate(result?.geometry?.location?.lng);
    if (!validCoordinates(latitude, longitude) || latitude === null || longitude === null) return null;

    const timezone = await resolveTimezoneFromCoordinates(latitude, longitude);
    if (!timezone) return null;

    return {
      query,
      displayName: String(result?.formatted_address || query).trim() || query,
      latitude,
      longitude,
      timezone,
      countryCode,
      provider: "google_maps",
    };
  } catch (error) {
    console.warn("Factory location Google geocoding unavailable; trying Open-Meteo", error);
    return null;
  }
}

async function resolveWithOpenMeteo(query: string, countryCode: string): Promise<ResolvedLocation | null> {
  const url = new URL(openMeteoEndpoint("geocoding"));
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", countryCode);
  appendOpenMeteoApiKey(url);

  const payload = await fetchProviderJson(url);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const result = results.find((candidate: OpenMeteoGeocodingResult) => {
    const candidateCode = String(candidate?.country_code || "").trim().toUpperCase();
    return !candidateCode || candidateCode === countryCode;
  }) as OpenMeteoGeocodingResult | undefined;

  const latitude = finiteCoordinate(result?.latitude);
  const longitude = finiteCoordinate(result?.longitude);
  const timezone = String(result?.timezone || "").trim();
  if (
    !validCoordinates(latitude, longitude) ||
    latitude === null ||
    longitude === null ||
    !isValidIanaTimezone(timezone)
  ) {
    return null;
  }

  const displayName = [result?.name, result?.admin1, result?.country]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");

  return {
    query,
    displayName: displayName || query,
    latitude,
    longitude,
    timezone,
    countryCode,
    provider: "open_meteo",
  };
}

export async function POST(req: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(req);
  if (originError) return originError;

  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  try {
    const body = (await req.json()) as { query?: unknown; countryCode?: unknown };
    const query = String(body?.query || "").trim();
    const countryCode = String(body?.countryCode || "").trim().toUpperCase();

    if (
      query.length < 2 ||
      query.length > MAX_QUERY_LENGTH ||
      !COUNTRY_CODE_PATTERN.test(countryCode)
    ) {
      return jsonResponse({ ok: false, error: "invalid_location" }, 400);
    }

    const resolved =
      (await resolveWithGoogle(query, countryCode)) ||
      (await resolveWithOpenMeteo(query, countryCode));

    if (!resolved) {
      return jsonResponse({ ok: false, error: "location_not_found" }, 404);
    }

    return jsonResponse({ ok: true, location: resolved }, 200);
  } catch (error) {
    console.error("Factory location authority resolution failed", error);
    return jsonResponse({ ok: false, error: "location_provider_unavailable" }, 503);
  }
}
