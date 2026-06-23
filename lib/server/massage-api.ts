import "server-only";

import { logSystemError } from "@/lib/server/system-events";

const MASSAGE_API_VERSION = "v12";
const DEFAULT_TIMEOUT_MS = 22_000;

const HOTEL_SLUG_ALIASES: Record<string, string> = {
  aquamarine: "aquamarin",
  aquamarin: "aquamarin",
  "aquamarine-test": "aquamarin-test",
  "aquamarin-test": "aquamarin-test",
};

// Sandbox hotels keep their own hotel_id/analytics, but can safely read the
// production massage catalogue/availability configuration unless a hotel-specific
// sandbox massage API is explicitly configured later.
const MASSAGE_CONFIG_SLUG_ALIASES: Record<string, string> = {
  "aquamarine-test": "aquamarin",
  "aquamarin-test": "aquamarin",
};

const DEFAULT_MASSAGE_HOTEL_CODES: Record<string, string> = {
  aquamarin: "AM",
  aquamarine: "AM",
  "aquamarin-test": "AM",
  "aquamarine-test": "AM",
  "sunny-castle": "SC",
  "sunny-castel": "SC",
  sunnycastle: "SC",
};


type MassageControlledE2ECandidate = {
  serviceId: string;
  date: string;
  time: string;
  room: string;
};

const MASSAGE_CONTROLLED_E2E_CANDIDATES: Record<string, MassageControlledE2ECandidate> = {
  aquamarin: {
    serviceId: "reflexotherapy",
    date: "2026-06-20",
    time: "9:15",
    room: "103",
  },
};

type MassageApiConfig = {
  hotelSlug: string;
  url: string;
  token: string;
};

type MassageApiEnvelope<T> = {
  ok: boolean;
  apiVersion?: string;
  requestId?: string;
  runtimeVersion?: string;
  status?: string;
  code?: string;
  message?: string;
  result?: T;
};

type MassageServerCacheEntry = {
  expiresAt: number;
  value: MassageApiEnvelope<unknown>;
};

type MassageServerCacheState = {
  values: Map<string, MassageServerCacheEntry>;
  inFlight: Map<string, Promise<MassageApiEnvelope<unknown>>>;
};

const globalMassageCache = globalThis as typeof globalThis & {
  __stayhubMassageApiCache?: MassageServerCacheState;
};

const massageServerCache =
  globalMassageCache.__stayhubMassageApiCache ||
  (globalMassageCache.__stayhubMassageApiCache = {
    values: new Map<string, MassageServerCacheEntry>(),
    inFlight: new Map<string, Promise<MassageApiEnvelope<unknown>>>(),
  });

type MassageApiConfigMap = Record<
  string,
  {
    url?: unknown;
    token?: unknown;
  }
>;

export type MassageService = {
  serviceId: string;
  nameBg: string;
  nameEn: string;
  nameDe: string;
  nameRo: string;
  nameCs: string;
  nameRu: string;
  durationMinutes: number;
  price: number;
  currency: string;
  bufferMinutes: number;
  sortOrder: number;
};

export type MassageServicesResult = {
  count: number;
  services: MassageService[];
};

export type MassageAvailabilityResult = {
  serviceId: string;
  serviceNameBg?: string;
  date: string | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  slotMinutes?: number;
  availableTimes: string[];
};

export type MassageBookableDate = {
  date: string;
  availableCount: number;
  firstAvailableTime: string;
  lastAvailableTime: string;
  availableTimes?: string[];
};

export type MassageBookableDatesResult = {
  serviceId: string;
  serviceNameBg: string;
  fromDate: string;
  daysChecked: number;
  count: number;
  dates: MassageBookableDate[];
};

export type MassageBootstrapResult = {
  fromDate: string;
  daysChecked: number;
  services: MassageServicesResult;
  availabilityByService: Record<string, MassageBookableDatesResult>;
  readMode?: string;
  elapsedMs?: number;
};

export type MassageBookingResult = {
  status: "BOOKING_WRITTEN" | "BOOKING_ALREADY_CONFIRMED";
  serviceId: string;
  serviceNameBg?: string | null;
  sheetValue?: string | null;
  price?: number;
  currency?: string | null;
  date: string;
  startTime: string;
  durationMinutes?: number;
  bufferMinutes?: number;
  reservedGridMinutes?: number;
  roomNumber: string;
  writeVerified: boolean;
  idempotentReplay: boolean;
  cleanupRequired?: boolean;
};

type MassageControlledE2EApiResult = {
  status: string;
  code?: string | null;
  message?: string | null;
  candidate?: {
    serviceId?: string;
    date?: string;
    time?: string;
    room?: string;
  } | null;
  bookingStatus?: string | null;
  writeVerified?: boolean;
  selectedTimeRemoved?: boolean;
  cleanupRequired?: boolean;
  idempotentReplay?: boolean;
};

type MassageBookingRejectedResult = {
  status: string;
  code?: string | null;
  message?: string | null;
};

type PostMassageApiOptions = {
  allowRejectedResult?: boolean;
};

export class MassageApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options?: { statusCode?: number; code?: string }) {
    super(message);
    this.name = "MassageApiError";
    this.statusCode = options?.statusCode ?? 502;
    this.code = options?.code ?? "MASSAGE_API_ERROR";
  }
}

export function normalizeMassageHotelSlug(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return HOTEL_SLUG_ALIASES[normalized] || normalized;
}

function getMassageConfigHotelSlug(inputHotelSlug: unknown) {
  const normalized = normalizeMassageHotelSlug(inputHotelSlug);
  return MASSAGE_CONFIG_SLUG_ALIASES[normalized] || normalized;
}

function getEnvironmentSuffix(hotelSlug: string) {
  return hotelSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function addMassageSlugAliasCandidates(output: Set<string>, value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!raw) return;

  output.add(raw);
  output.add(normalizeMassageHotelSlug(raw));
  output.add(getMassageConfigHotelSlug(raw));

  // Aquamarine is the public spelling, while the legacy internal slug is aquamarin.
  // Try both for environment-variable and STAYHUB_MASSAGE_API_CONFIG_JSON keys.
  if (raw === "aquamarin") output.add("aquamarine");
  if (raw === "aquamarine") output.add("aquamarin");
  if (raw === "aquamarin-test") {
    output.add("aquamarine-test");
    output.add("aquamarin");
    output.add("aquamarine");
  }
  if (raw === "aquamarine-test") {
    output.add("aquamarin-test");
    output.add("aquamarin");
    output.add("aquamarine");
  }

  // Generic future-hotel rule: a sandbox twin can reuse production massage read
  // config unless its own sandbox config is explicitly provided.
  if (raw.endsWith("-test")) {
    const productionSlug = raw.replace(/-test$/, "");
    if (productionSlug) {
      output.add(productionSlug);
      output.add(normalizeMassageHotelSlug(productionSlug));
    }
  }
}

function getMassageConfigSlugCandidates(inputHotelSlug: unknown) {
  const candidates = new Set<string>();
  addMassageSlugAliasCandidates(candidates, inputHotelSlug);
  addMassageSlugAliasCandidates(candidates, getMassageConfigHotelSlug(inputHotelSlug));
  return Array.from(candidates).filter(Boolean);
}

function getFirstHotelEnv(prefix: string, candidates: string[]) {
  for (const candidate of candidates) {
    const suffix = getEnvironmentSuffix(candidate);
    const value = String(process.env[`${prefix}_${suffix}`] || "").trim();
    if (value) return value;
  }
  return "";
}

function getFirstConfiguredFlag(prefix: string, candidates: string[]) {
  for (const candidate of candidates) {
    const suffix = getEnvironmentSuffix(candidate);
    const key = `${prefix}_${suffix}`;
    if (process.env[key] !== undefined && String(process.env[key]).trim() !== "") {
      return process.env[key];
    }
  }
  return undefined;
}

export function getMassageHotelCode(inputHotelSlug: unknown) {
  const normalized = normalizeMassageHotelSlug(inputHotelSlug);
  const candidates = getMassageConfigSlugCandidates(inputHotelSlug);
  const configured = String(
    getFirstHotelEnv("STAYHUB_MASSAGE_HOTEL_CODE", candidates) ||
      getFirstHotelEnv("STAYHUB_HOTEL_CODE", candidates) ||
      ""
  ).trim().toUpperCase();

  const fallbackSlug = candidates.find((candidate) => DEFAULT_MASSAGE_HOTEL_CODES[candidate]) || normalized;

  return (configured || DEFAULT_MASSAGE_HOTEL_CODES[fallbackSlug] || "HT")
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
}

export function buildMassageStayHubSheetRoomMarker(input: {
  hotelSlug: unknown;
  room: unknown;
}) {
  const room = String(input.room || "").trim();
  const hotelCode = getMassageHotelCode(input.hotelSlug);
  return [room, hotelCode, "SH"].filter(Boolean).join(" ");
}

function parseEnabledFlag(value: unknown) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

export function isMassageBookingPostEnabled(inputHotelSlug: unknown) {
  const candidates = getMassageConfigSlugCandidates(inputHotelSlug);
  if (!candidates.length) return false;

  const hotelSpecific = getFirstConfiguredFlag("STAYHUB_MASSAGE_BOOKING_ENABLED", candidates);

  if (hotelSpecific !== undefined && String(hotelSpecific).trim() !== "") {
    return parseEnabledFlag(hotelSpecific);
  }

  return parseEnabledFlag(process.env.STAYHUB_MASSAGE_BOOKING_ENABLED);
}


export function isMassageControlledE2EEnabled(inputHotelSlug: unknown) {
  const candidates = getMassageConfigSlugCandidates(inputHotelSlug);
  if (!candidates.length) return false;

  const hotelSpecific = getFirstConfiguredFlag("STAYHUB_MASSAGE_E2E_ENABLED", candidates);

  if (hotelSpecific !== undefined && String(hotelSpecific).trim() !== "") {
    return parseEnabledFlag(hotelSpecific);
  }

  return parseEnabledFlag(process.env.STAYHUB_MASSAGE_E2E_ENABLED);
}

export function isApprovedMassageControlledE2ECandidate(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
}) {
  const hotelSlug = getMassageConfigHotelSlug(input.hotelSlug);
  const candidate = MASSAGE_CONTROLLED_E2E_CANDIDATES[hotelSlug];

  return Boolean(
    candidate &&
      candidate.serviceId === input.serviceId &&
      candidate.date === input.date &&
      candidate.time === input.time &&
      candidate.room === input.room
  );
}

function readConfigMap(): MassageApiConfigMap {
  const raw = String(process.env.STAYHUB_MASSAGE_API_CONFIG_JSON || "").trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected an object");
    }
    return parsed as MassageApiConfigMap;
  } catch {
    throw new MassageApiError("Massage API configuration is invalid.", {
      statusCode: 500,
      code: "INVALID_MASSAGE_API_CONFIG",
    });
  }
}

function validateWebAppUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new MassageApiError("Massage API URL is invalid.", {
      statusCode: 500,
      code: "INVALID_MASSAGE_API_URL",
    });
  }

  const validPath = parsed.pathname.startsWith("/macros/s/") && parsed.pathname.endsWith("/exec");

  if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" || !validPath) {
    throw new MassageApiError("Massage API URL is not an approved Google Apps Script Web App URL.", {
      statusCode: 500,
      code: "UNAPPROVED_MASSAGE_API_URL",
    });
  }

  return parsed.toString();
}

function getMassageApiConfig(inputHotelSlug: unknown): MassageApiConfig {
  const hotelSlug = getMassageConfigHotelSlug(inputHotelSlug);
  const candidates = getMassageConfigSlugCandidates(inputHotelSlug);

  if (!hotelSlug || !candidates.length) {
    throw new MassageApiError("Hotel slug is required.", {
      statusCode: 400,
      code: "MISSING_HOTEL_SLUG",
    });
  }

  const configMap = readConfigMap();
  const mapped = candidates.map((candidate) => configMap[candidate]).find(Boolean);

  const rawUrl = String(
    mapped?.url ||
      getFirstHotelEnv("STAYHUB_MASSAGE_API_URL", candidates) ||
      process.env.STAYHUB_MASSAGE_API_URL ||
      ""
  ).trim();

  const token = String(
    mapped?.token ||
      getFirstHotelEnv("STAYHUB_MASSAGE_API_TOKEN", candidates) ||
      process.env.STAYHUB_MASSAGE_API_TOKEN ||
      ""
  ).trim();

  if (!rawUrl || !token) {
    throw new MassageApiError("Massage reservations are not configured for this hotel.", {
      statusCode: 503,
      code: "MASSAGE_API_NOT_CONFIGURED",
    });
  }

  if (token.length < 32) {
    throw new MassageApiError("Massage API token configuration is invalid.", {
      statusCode: 500,
      code: "INVALID_MASSAGE_API_TOKEN_CONFIG",
    });
  }

  return {
    hotelSlug,
    url: validateWebAppUrl(rawUrl),
    token,
  };
}


function getMassageControlledE2EToken(inputHotelSlug: unknown) {
  const hotelSlug = getMassageConfigHotelSlug(inputHotelSlug);
  const candidates = getMassageConfigSlugCandidates(inputHotelSlug);

  if (!hotelSlug || !candidates.length) {
    throw new MassageApiError("Hotel slug is required.", {
      statusCode: 400,
      code: "MISSING_HOTEL_SLUG",
    });
  }

  const token = String(
    getFirstHotelEnv("STAYHUB_MASSAGE_E2E_TOKEN", candidates) ||
      process.env.STAYHUB_MASSAGE_E2E_TOKEN ||
      ""
  ).trim();

  if (!token) {
    throw new MassageApiError("Controlled massage E2E token is not configured.", {
      statusCode: 503,
      code: "MASSAGE_E2E_TOKEN_NOT_CONFIGURED",
    });
  }

  if (token.length < 32) {
    throw new MassageApiError("Controlled massage E2E token configuration is invalid.", {
      statusCode: 500,
      code: "INVALID_MASSAGE_E2E_TOKEN_CONFIG",
    });
  }

  return token;
}

function getMassageReadCacheTtl(payload: Record<string, unknown>) {
  const action = String(payload.action || "").trim().toLowerCase();
  if (action === "services") return 30 * 60 * 1000;
  if (action === "bootstrap") return 20 * 1000;
  if (action === "bookable_dates") return 20 * 1000;
  if (action === "availability") return 8 * 1000;
  return 0;
}

function getMassageReadCacheKey(hotelSlug: string, payload: Record<string, unknown>) {
  return `${hotelSlug}:${JSON.stringify(payload)}`;
}

async function postMassageApi<T>(
  hotelSlug: unknown,
  payload: Record<string, unknown>,
  options: PostMassageApiOptions = {}
): Promise<MassageApiEnvelope<T>> {
  const config = getMassageApiConfig(hotelSlug);
  const cacheTtl = getMassageReadCacheTtl(payload);
  const cacheKey = getMassageReadCacheKey(config.hotelSlug, payload);
  const now = Date.now();
  const cached = massageServerCache.values.get(cacheKey);

  if (cacheTtl > 0 && cached && cached.expiresAt > now) {
    return cached.value as MassageApiEnvelope<T>;
  }

  if (cached) massageServerCache.values.delete(cacheKey);

  const existing = massageServerCache.inFlight.get(cacheKey);
  if (existing) return existing as Promise<MassageApiEnvelope<T>>;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          apiToken: config.token,
        }),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new MassageApiError("Massage calendar service is temporarily unavailable.", {
          statusCode: 502,
          code: "MASSAGE_API_HTTP_ERROR",
        });
      }

      const data = (await response.json().catch(() => null)) as MassageApiEnvelope<T> | null;

      if (!data || typeof data !== "object") {
        throw new MassageApiError("Massage calendar returned an invalid response.", {
          statusCode: 502,
          code: "INVALID_MASSAGE_API_RESPONSE",
        });
      }

      if (data.apiVersion && data.apiVersion !== MASSAGE_API_VERSION) {
        throw new MassageApiError("Massage calendar API version is not supported.", {
          statusCode: 502,
          code: "UNSUPPORTED_MASSAGE_API_VERSION",
        });
      }

      if (!data.ok || !data.result) {
        const isUnauthorized = data.status === "API_UNAUTHORIZED" || data.code === "INVALID_API_TOKEN";

        if (options.allowRejectedResult && data.result && !isUnauthorized) {
          return data;
        }

        throw new MassageApiError(
          isUnauthorized
            ? "Massage calendar authorization failed."
            : "Massage calendar could not complete the request.",
          {
            statusCode: isUnauthorized ? 502 : 409,
            code: String(data.code || data.status || "MASSAGE_API_REJECTED"),
          }
        );
      }

      return data;
    } catch (error) {
      if (error instanceof MassageApiError) {
        await logSystemError({
          severity: error.statusCode >= 500 ? "critical" : "warning",
          source: "apps_script",
          eventType: error.code || "massage_api_error",
          message: "Massage Apps Script API returned or caused a controlled error.",
          error,
          metadata: { hotelSlug: config.hotelSlug, action: payload.action || null },
        });
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new MassageApiError("Massage calendar request timed out.", {
          statusCode: 504,
          code: "MASSAGE_API_TIMEOUT",
        });
        await logSystemError({
          severity: "critical",
          source: "apps_script",
          eventType: timeoutError.code,
          message: "Massage Apps Script API request timed out.",
          error: timeoutError,
          metadata: { hotelSlug: config.hotelSlug, action: payload.action || null },
        });
        throw timeoutError;
      }

      const unavailableError = new MassageApiError("Massage calendar service is temporarily unavailable.", {
        statusCode: 502,
        code: "MASSAGE_API_UNAVAILABLE",
      });
      await logSystemError({
        severity: "critical",
        source: "apps_script",
        eventType: unavailableError.code,
        message: "Massage Apps Script API request failed unexpectedly.",
        error,
        metadata: { hotelSlug: config.hotelSlug, action: payload.action || null },
      });
      throw unavailableError;
    } finally {
      clearTimeout(timeout);
    }
  })();

  massageServerCache.inFlight.set(
    cacheKey,
    request as Promise<MassageApiEnvelope<unknown>>
  );

  try {
    const result = await request;
    if (cacheTtl > 0) {
      massageServerCache.values.set(cacheKey, {
        expiresAt: Date.now() + cacheTtl,
        value: result as MassageApiEnvelope<unknown>,
      });
    }
    return result;
  } finally {
    massageServerCache.inFlight.delete(cacheKey);
  }
}


export async function getMassageBootstrap(input: {
  hotelSlug: unknown;
  fromDate: string;
  daysAhead: number;
}) {
  const response = await postMassageApi<MassageBootstrapResult>(input.hotelSlug, {
    action: "bootstrap",
    fromDate: input.fromDate,
    daysAhead: input.daysAhead,
  });

  return response.result as MassageBootstrapResult;
}

export async function getMassageServices(hotelSlug: unknown) {
  const response = await postMassageApi<MassageServicesResult>(hotelSlug, {
    action: "services",
  });

  return response.result as MassageServicesResult;
}

export async function getMassageAvailability(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
}) {
  const response = await postMassageApi<MassageAvailabilityResult>(input.hotelSlug, {
    action: "availability",
    serviceId: input.serviceId,
    date: input.date,
  });

  return response.result as MassageAvailabilityResult;
}

export async function getMassageBookableDates(input: {
  hotelSlug: unknown;
  serviceId: string;
  fromDate: string;
  daysAhead: number;
}) {
  const response = await postMassageApi<MassageBookableDatesResult>(input.hotelSlug, {
    action: "bookable_dates",
    serviceId: input.serviceId,
    fromDate: input.fromDate,
    daysAhead: input.daysAhead,
  });

  return response.result as MassageBookableDatesResult;
}


function invalidateMassageReadCacheForHotel(inputHotelSlug: unknown) {
  const hotelSlug = getMassageConfigHotelSlug(inputHotelSlug);
  if (!hotelSlug) return;

  const prefix = `${hotelSlug}:`;
  for (const key of massageServerCache.values.keys()) {
    if (key.startsWith(prefix)) {
      massageServerCache.values.delete(key);
    }
  }
}

export async function createMassageBooking(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
}) {
  const response = await postMassageApi<MassageBookingResult | MassageBookingRejectedResult>(
    input.hotelSlug,
    {
      action: "book",
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      room: input.room,
      stayhubRoomNumber: input.room,
      stayhubHotelCode: getMassageHotelCode(input.hotelSlug),
      stayhubRoomMarker: buildMassageStayHubSheetRoomMarker({
        hotelSlug: input.hotelSlug,
        room: input.room,
      }),
      // Never accept browser-controlled test mode. This server path can only
      // request a real booking, and Apps Script still has its own write guard.
      testMode: false,
    },
    { allowRejectedResult: true }
  );

  const result = response.result;

  if (!result) {
    throw new MassageApiError("Massage calendar returned an incomplete booking response.", {
      statusCode: 502,
      code: "INVALID_MASSAGE_BOOKING_RESPONSE",
    });
  }

  if (
    response.ok &&
    (result.status === "BOOKING_WRITTEN" || result.status === "BOOKING_ALREADY_CONFIRMED")
  ) {
    invalidateMassageReadCacheForHotel(input.hotelSlug);
    return result as MassageBookingResult;
  }

  const rejected = result as MassageBookingRejectedResult;
  const code = String(rejected.code || response.code || response.status || "MASSAGE_BOOKING_REJECTED");
  const message = String(rejected.message || response.message || "Massage booking could not be completed.");

  if (response.status === "BOOKING_CONFLICT" || code === "SLOT_NO_LONGER_AVAILABLE") {
    throw new MassageApiError(message, {
      statusCode: 409,
      code: "SLOT_NO_LONGER_AVAILABLE",
    });
  }

  if (response.status === "PRODUCTION_WRITE_DISABLED" || code === "PRODUCTION_WRITE_DISABLED") {
    throw new MassageApiError("Massage booking submission is not enabled in the calendar yet.", {
      statusCode: 503,
      code: "MASSAGE_CALENDAR_WRITE_DISABLED",
    });
  }

  if (code === "CALENDAR_BUSY") {
    throw new MassageApiError(message, {
      statusCode: 503,
      code,
    });
  }

  if (response.status === "BOOKING_REJECTED") {
    throw new MassageApiError(message, {
      statusCode: 400,
      code,
    });
  }

  throw new MassageApiError(message, {
    statusCode: 409,
    code,
  });
}

export async function createMassageControlledE2EBooking(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
}) {
  if (!isMassageControlledE2EEnabled(input.hotelSlug)) {
    throw new MassageApiError("Controlled massage E2E mode is disabled.", {
      statusCode: 503,
      code: "MASSAGE_E2E_DISABLED",
    });
  }

  if (!isApprovedMassageControlledE2ECandidate(input)) {
    throw new MassageApiError("This is not the approved controlled massage test candidate.", {
      statusCode: 403,
      code: "MASSAGE_E2E_CANDIDATE_NOT_ALLOWED",
    });
  }

  const e2eToken = getMassageControlledE2EToken(input.hotelSlug);
  const response = await postMassageApi<MassageControlledE2EApiResult>(
    input.hotelSlug,
    {
      action: "controlled_e2e_book",
      e2eToken,
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      room: input.room,
      stayhubRoomNumber: input.room,
      stayhubHotelCode: getMassageHotelCode(input.hotelSlug),
      stayhubRoomMarker: buildMassageStayHubSheetRoomMarker({
        hotelSlug: input.hotelSlug,
        room: input.room,
      }),
    },
    { allowRejectedResult: true }
  );

  const result = response.result;

  if (!result) {
    throw new MassageApiError("Massage calendar returned an incomplete controlled test response.", {
      statusCode: 502,
      code: "INVALID_MASSAGE_E2E_RESPONSE",
    });
  }

  if (
    response.ok &&
    (result.status === "E2E_BOOKING_WRITTEN" ||
      result.status === "E2E_BOOKING_ALREADY_CONFIRMED")
  ) {
    invalidateMassageReadCacheForHotel(input.hotelSlug);

    const alreadyConfirmed = result.status === "E2E_BOOKING_ALREADY_CONFIRMED";
    const candidate = result.candidate || {};

    return {
      status: alreadyConfirmed ? "BOOKING_ALREADY_CONFIRMED" : "BOOKING_WRITTEN",
      serviceId: String(candidate.serviceId || input.serviceId),
      date: String(candidate.date || input.date),
      startTime: String(candidate.time || input.time),
      roomNumber: String(candidate.room || input.room),
      writeVerified: result.writeVerified === true,
      idempotentReplay: alreadyConfirmed || result.idempotentReplay === true,
      cleanupRequired: result.cleanupRequired === true,
    } satisfies MassageBookingResult;
  }

  const code = String(result.code || response.code || response.status || "MASSAGE_E2E_REJECTED");
  const message = String(
    result.message || response.message || "Controlled massage E2E booking could not be completed."
  );

  if (result.status === "E2E_CONFLICT" || code === "SLOT_NO_LONGER_AVAILABLE") {
    throw new MassageApiError(message, {
      statusCode: 409,
      code: "SLOT_NO_LONGER_AVAILABLE",
    });
  }

  if (result.status === "E2E_UNAUTHORIZED" || code === "INVALID_E2E_TOKEN") {
    throw new MassageApiError("Controlled massage E2E authorization failed.", {
      statusCode: 502,
      code: "MASSAGE_E2E_AUTH_FAILED",
    });
  }

  if (result.status === "E2E_NOT_CONFIGURED" || code === "MISSING_E2E_TOKEN_PROPERTY") {
    throw new MassageApiError(message, {
      statusCode: 503,
      code: "MASSAGE_E2E_NOT_CONFIGURED",
    });
  }

  if (result.status === "E2E_CHECK_REQUIRED") {
    throw new MassageApiError(message, {
      statusCode: 500,
      code: "MASSAGE_E2E_CHECK_REQUIRED",
    });
  }

  if (result.status === "E2E_REJECTED" && code === "CANDIDATE_NOT_ALLOWED") {
    throw new MassageApiError(message, {
      statusCode: 403,
      code: "MASSAGE_E2E_CANDIDATE_NOT_ALLOWED",
    });
  }

  if (code === "CALENDAR_BUSY") {
    throw new MassageApiError(message, {
      statusCode: 503,
      code,
    });
  }

  throw new MassageApiError(message, {
    statusCode: 409,
    code,
  });
}

