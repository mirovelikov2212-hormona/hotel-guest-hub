import "server-only";

const MASSAGE_API_VERSION = "v12";
const DEFAULT_TIMEOUT_MS = 12_000;

const HOTEL_SLUG_ALIASES: Record<string, string> = {
  aquamarine: "aquamarin",
  aquamarin: "aquamarin",
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
  serviceNameBg: string | null;
  sheetValue: string | null;
  price: number;
  currency: string | null;
  date: string;
  startTime: string;
  durationMinutes: number;
  bufferMinutes: number;
  reservedGridMinutes: number;
  roomNumber: string;
  writeVerified: boolean;
  idempotentReplay: boolean;
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

function getEnvironmentSuffix(hotelSlug: string) {
  return hotelSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function parseEnabledFlag(value: unknown) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

export function isMassageBookingPostEnabled(inputHotelSlug: unknown) {
  const hotelSlug = normalizeMassageHotelSlug(inputHotelSlug);
  if (!hotelSlug) return false;

  const suffix = getEnvironmentSuffix(hotelSlug);
  const hotelSpecific = process.env[`STAYHUB_MASSAGE_BOOKING_ENABLED_${suffix}`];

  if (hotelSpecific !== undefined && String(hotelSpecific).trim() !== "") {
    return parseEnabledFlag(hotelSpecific);
  }

  return parseEnabledFlag(process.env.STAYHUB_MASSAGE_BOOKING_ENABLED);
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
  const hotelSlug = normalizeMassageHotelSlug(inputHotelSlug);

  if (!hotelSlug) {
    throw new MassageApiError("Hotel slug is required.", {
      statusCode: 400,
      code: "MISSING_HOTEL_SLUG",
    });
  }

  const suffix = getEnvironmentSuffix(hotelSlug);
  const configMap = readConfigMap();
  const mapped = configMap[hotelSlug] || configMap[String(inputHotelSlug || "").trim().toLowerCase()];

  const rawUrl = String(
    mapped?.url ||
      process.env[`STAYHUB_MASSAGE_API_URL_${suffix}`] ||
      process.env.STAYHUB_MASSAGE_API_URL ||
      ""
  ).trim();

  const token = String(
    mapped?.token ||
      process.env[`STAYHUB_MASSAGE_API_TOKEN_${suffix}`] ||
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
      if (error instanceof MassageApiError) throw error;

      if (error instanceof Error && error.name === "AbortError") {
        throw new MassageApiError("Massage calendar request timed out.", {
          statusCode: 504,
          code: "MASSAGE_API_TIMEOUT",
        });
      }

      throw new MassageApiError("Massage calendar service is temporarily unavailable.", {
        statusCode: 502,
        code: "MASSAGE_API_UNAVAILABLE",
      });
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
  const hotelSlug = normalizeMassageHotelSlug(inputHotelSlug);
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
