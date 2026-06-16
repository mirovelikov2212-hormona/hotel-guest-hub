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
  runtimeVersion?: string;
  status?: string;
  code?: string;
  message?: string;
  result?: T;
};

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
};

export type MassageBookableDatesResult = {
  serviceId: string;
  serviceNameBg: string;
  fromDate: string;
  daysChecked: number;
  count: number;
  dates: MassageBookableDate[];
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

async function postMassageApi<T>(
  hotelSlug: unknown,
  payload: Record<string, unknown>
): Promise<MassageApiEnvelope<T>> {
  const config = getMassageApiConfig(hotelSlug);
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
