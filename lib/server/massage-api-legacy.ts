import "server-only";

import { logSystemError } from "@/lib/server/system-events";
import type { SystemEventSeverity } from "@/lib/server/system-events";

const MASSAGE_API_VERSION = "v12";
const DEFAULT_TIMEOUT_MS = 12_000;
const MASSAGE_BOOKING_TIMEOUT_MS = 7_000;
const MASSAGE_VERIFY_TIMEOUT_MS = 4_000;
const MASSAGE_API_MAX_ATTEMPTS = 2;
const MASSAGE_SNAPSHOT_REFRESH_TIMEOUT_MS = 45_000;
const MASSAGE_SNAPSHOT_REFRESH_MAX_ATTEMPTS = 1;
const MASSAGE_TRANSIENT_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MASSAGE_TRANSIENT_CRITICAL_THRESHOLD = 3;

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
  liveContract?: string;
  action?: string;
  requestMethod?: string;
  status?: string;
  code?: string;
  message?: string;
  result?: T;
};

type MassageServerCacheEntry = {
  expiresAt: number;
  staleUntil: number;
  value: MassageApiEnvelope<unknown>;
};

type MassageTransientFailureState = {
  count: number;
  firstAt: number;
  lastAt: number;
};

type MassageServerCacheState = {
  values: Map<string, MassageServerCacheEntry>;
  inFlight: Map<string, Promise<MassageApiEnvelope<unknown>>>;
  transientFailures: Map<string, MassageTransientFailureState>;
};

const globalMassageCache = globalThis as typeof globalThis & {
  __stayhubMassageApiCache?: MassageServerCacheState;
};

const massageServerCache =
  globalMassageCache.__stayhubMassageApiCache ||
  (globalMassageCache.__stayhubMassageApiCache = {
    values: new Map<string, MassageServerCacheEntry>(),
    inFlight: new Map<string, Promise<MassageApiEnvelope<unknown>>>(),
    transientFailures: new Map<string, MassageTransientFailureState>(),
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
  nameI18n?: Record<string, string>;
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
  availableCount?: number;
  firstAvailableTime?: string;
  lastAvailableTime?: string;
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
  runtimeVersion?: string;
  liveContract?: string;
  revision?: string | null;
  cacheHit?: boolean;
  fromDate: string;
  daysChecked: number;
  services: MassageServicesResult;
  availabilityByService: Record<string, MassageBookableDatesResult>;
  readMode?: string;
  readStats?: Record<string, unknown> | null;
  elapsedMs?: number;
};

export type MassageCalendarSnapshotBooking = {
  date: string;
  startTime: string;
  roomNumber: string;
  roomMarker: string;
  hotelCode: string | null;
  isStayHubMarker: boolean;
  sheetValue: string;
  serviceId?: string | null;
  serviceNameBg?: string | null;
  durationMinutes?: number | null;
  price?: number | null;
  currency?: string | null;
  sheetName?: string | null;
  rowNumber?: number | null;
  massageCell?: string | null;
  roomCell?: string | null;
};

export type MassageCalendarSnapshotResult = {
  fromDate: string;
  daysChecked: number;
  count: number;
  bookings: MassageCalendarSnapshotBooking[];
  readMode?: string;
  elapsedMs?: number;
};

type MassageSnapshotBundleApiResult = {
  runtimeVersion?: string;
  liveContract?: string;
  revision?: string | null;
  fromDate: string;
  daysChecked: number;
  bootstrap: MassageBootstrapResult;
  calendar: MassageCalendarSnapshotResult;
  readMode?: string;
  readStats?: Record<string, unknown> | null;
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

export type MassageBookingVerificationResult = Partial<MassageBookingResult> & {
  status: "BOOKING_ALREADY_CONFIRMED" | "BOOKING_CONFLICT" | "BOOKING_NOT_FOUND";
  verificationStatus: "BOOKING_CONFIRMED" | "BOOKING_CONFLICT" | "BOOKING_NOT_FOUND";
  confirmed?: boolean;
  code?: string | null;
  message?: string | null;
  elapsedMs?: number;
};

export type MassageSnapshotSourceBundle = {
  bootstrap: MassageBootstrapResult;
  calendar: MassageCalendarSnapshotResult;
  source: {
    revision: string;
    runtimeVersion: string | null;
    liveContract: string | null;
    requestIds: {
      bootstrap: string | null;
      calendar: string | null;
    };
    statuses: {
      bootstrap: string | null;
      calendar: string | null;
    };
  };
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

type MassageRecoveredBookingResult = MassageBookingResult & {
  verificationStatus?: string;
  elapsedMs?: number;
};

type MassageBookingVerificationOutcome =
  | { kind: "confirmed"; result: MassageRecoveredBookingResult }
  | { kind: "conflict"; code: string; message: string }
  | { kind: "not_found"; code: string; message: string };

type PostMassageApiOptions = {
  allowRejectedResult?: boolean;
  suppressFailureLog?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
  deferFailureLogging?: boolean;
  deferFailureLoggingCodes?: string[];
};

export class MassageApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly action: string | null;
  readonly upstreamStatus: number | null;

  readonly monitoringSeverity: SystemEventSeverity | null;
  readonly alreadyLogged: boolean;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      action?: string | null;
      upstreamStatus?: number | null;
      monitoringSeverity?: SystemEventSeverity | null;
      alreadyLogged?: boolean;
    }
  ) {
    super(message);
    this.name = "MassageApiError";
    this.statusCode = options?.statusCode ?? 502;
    this.code = options?.code ?? "MASSAGE_API_ERROR";
    this.action = String(options?.action || "").trim() || null;
    this.upstreamStatus = Number.isInteger(options?.upstreamStatus)
      ? Number(options?.upstreamStatus)
      : null;
    this.monitoringSeverity = options?.monitoringSeverity ?? null;
    this.alreadyLogged = options?.alreadyLogged === true;
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

function getMassageSandboxLiveWriteEnvKey(
  prefix: string,
  inputHotelSlug: unknown
) {
  const hotelSlug = normalizeMassageHotelSlug(inputHotelSlug);
  if (!hotelSlug) return "";
  return `${prefix}_${getEnvironmentSuffix(hotelSlug)}`;
}

export function isMassageSandboxLiveWriteEnabled(inputHotelSlug: unknown) {
  const key = getMassageSandboxLiveWriteEnvKey(
    "STAYHUB_MASSAGE_SANDBOX_LIVE_WRITE_ENABLED",
    inputHotelSlug
  );

  return key ? parseEnabledFlag(process.env[key]) : false;
}

export function isApprovedMassageSandboxLiveWriteCandidate(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
}) {
  const key = getMassageSandboxLiveWriteEnvKey(
    "STAYHUB_MASSAGE_SANDBOX_LIVE_WRITE_CANDIDATE",
    input.hotelSlug
  );
  const configuredCandidate = key
    ? String(process.env[key] || "").trim()
    : "";
  const requestedCandidate = [
    input.serviceId,
    input.date,
    input.time,
    input.room,
  ].join("|");

  return Boolean(configuredCandidate) &&
    configuredCandidate === requestedCandidate;
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
  if (action === "bootstrap") return 2 * 60 * 1000;
  if (action === "bookable_dates") return 30 * 1000;
  if (action === "bookable_dates_summary") return 2 * 60 * 1000;
  if (action === "availability") return 15 * 1000;
  if (action === "calendar_snapshot") return 0;
  if (action === "snapshot_bundle") return 0;
  return 0;
}

function getMassageStaleCacheTtl(payload: Record<string, unknown>) {
  const action = String(payload.action || "").trim().toLowerCase();

  // Stale data is used only as a short production-safety fallback when Google
  // Apps Script/Sheets is slow. Booking writes and calendar snapshots never use it.
  if (action === "services") return 24 * 60 * 60 * 1000;
  if (action === "bootstrap") return 15 * 60 * 1000;
  if (action === "bookable_dates") return 10 * 60 * 1000;
  if (action === "bookable_dates_summary") return 10 * 60 * 1000;
  if (action === "availability") return 5 * 60 * 1000;
  return 0;
}

function isMassageReadAction(payload: Record<string, unknown>) {
  const action = String(payload.action || "").trim().toLowerCase();
  return [
    "services",
    "bootstrap",
    "bookable_dates",
    "bookable_dates_summary",
    "availability",
    "calendar_snapshot",
    "snapshot_bundle",
  ].includes(action);
}

function isTransientMassageApiCode(code: string) {
  return ["MASSAGE_API_TIMEOUT", "MASSAGE_API_UNAVAILABLE", "MASSAGE_API_HTTP_ERROR"].includes(code);
}

function getMassageReadCacheKey(hotelSlug: string, payload: Record<string, unknown>) {
  return `${hotelSlug}:${JSON.stringify(payload)}`;
}

function getMassageTransientFailureKey(input: {
  hotelSlug: string;
  action: unknown;
  code: string;
}) {
  return [input.hotelSlug, String(input.action || "unknown"), input.code].join(":");
}

function recordMassageTransientFailure(input: {
  hotelSlug: string;
  action: unknown;
  code: string;
}) {
  const key = getMassageTransientFailureKey(input);
  const now = Date.now();
  const previous = massageServerCache.transientFailures.get(key);
  const shouldReset = !previous || now - previous.lastAt > MASSAGE_TRANSIENT_FAILURE_WINDOW_MS;
  const state: MassageTransientFailureState = shouldReset
    ? { count: 1, firstAt: now, lastAt: now }
    : { count: previous.count + 1, firstAt: previous.firstAt, lastAt: now };

  massageServerCache.transientFailures.set(key, state);
  return state;
}

function clearMassageTransientFailure(input: {
  hotelSlug: string;
  action: unknown;
}) {
  const action = String(input.action || "unknown");
  for (const key of massageServerCache.transientFailures.keys()) {
    if (key.startsWith(`${input.hotelSlug}:${action}:`)) {
      massageServerCache.transientFailures.delete(key);
    }
  }
}

function shouldDeferMassageFailureLogging(
  options: PostMassageApiOptions,
  error: MassageApiError
) {
  return Boolean(
    options.suppressFailureLog ||
      options.deferFailureLogging ||
      options.deferFailureLoggingCodes?.includes(error.code)
  );
}

async function logMassageApiReadFailure(input: {
  hotelSlug: string;
  payload: Record<string, unknown>;
  error: MassageApiError;
  staleFallbackUsed: boolean;
  attemptCount: number;
}) {
  const transient = isTransientMassageApiCode(input.error.code) && isMassageReadAction(input.payload);
  let severity: SystemEventSeverity = input.error.statusCode >= 500 ? "critical" : "warning";
  let transientState: MassageTransientFailureState | null = null;

  if (transient) {
    transientState = recordMassageTransientFailure({
      hotelSlug: input.hotelSlug,
      action: input.payload.action,
      code: input.error.code,
    });
    severity = transientState.count >= MASSAGE_TRANSIENT_CRITICAL_THRESHOLD ? "critical" : "warning";
  }

  if (input.staleFallbackUsed) {
    severity = transientState && transientState.count >= MASSAGE_TRANSIENT_CRITICAL_THRESHOLD
      ? "critical"
      : "warning";
  }

  await logSystemError({
    severity,
    source: "apps_script",
    eventType: input.error.code || "massage_api_error",
    message: input.staleFallbackUsed
      ? "Massage Apps Script API request failed, but StayHub served the last successful cached response."
      : transient
        ? "Massage Apps Script API request failed for a read action after retry/stability handling."
        : "Massage Apps Script API returned or caused a controlled error.",
    error: input.error,
    metadata: {
      hotelSlug: input.hotelSlug,
      action: input.payload.action || null,
      attemptCount: input.attemptCount,
      transientFailureCount: transientState ? transientState.count : null,
      transientCriticalThreshold: transient ? MASSAGE_TRANSIENT_CRITICAL_THRESHOLD : null,
      staleFallbackUsed: input.staleFallbackUsed,
      staleFallbackAvailable: input.staleFallbackUsed,
      upstreamStatus: input.error.upstreamStatus,
    },
  });

  return severity;
}

async function fetchMassageApiOnce<T>(input: {
  config: MassageApiConfig;
  payload: Record<string, unknown>;
  options: PostMassageApiOptions;
}): Promise<MassageApiEnvelope<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetch(input.config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input.payload,
        apiToken: input.config.token,
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new MassageApiError(
        `Massage calendar service returned HTTP ${response.status}.`,
        {
          statusCode: 502,
          code: "MASSAGE_API_HTTP_ERROR",
          action: String(input.payload.action || "").trim() || null,
          upstreamStatus: response.status,
        }
      );
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

    const expectedAction = String(input.payload.action || "").trim().toLowerCase();
    if (
      expectedAction === "snapshot_bundle" &&
      (String(data.action || "").trim().toLowerCase() !== expectedAction ||
        String(data.requestMethod || "").trim().toUpperCase() !== "POST")
    ) {
      throw new MassageApiError(
        "Massage calendar returned a response for a different action or HTTP method.",
        {
          statusCode: 502,
          code: "MASSAGE_API_METHOD_MISMATCH",
          action: expectedAction,
        }
      );
    }

    if (!data.ok || !data.result) {
      const isUnauthorized = data.status === "API_UNAUTHORIZED" || data.code === "INVALID_API_TOKEN";

      if (input.options.allowRejectedResult && data.result && !isUnauthorized) {
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
      throw error;
    }

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

async function postMassageApi<T>(
  hotelSlug: unknown,
  payload: Record<string, unknown>,
  options: PostMassageApiOptions = {}
): Promise<MassageApiEnvelope<T>> {
  const config = getMassageApiConfig(hotelSlug);
  const cacheTtl = getMassageReadCacheTtl(payload);
  const staleCacheTtl = getMassageStaleCacheTtl(payload);
  const cacheKey = getMassageReadCacheKey(config.hotelSlug, payload);
  const now = Date.now();
  const cached = massageServerCache.values.get(cacheKey);

  if (cacheTtl > 0 && cached && cached.expiresAt > now) {
    return cached.value as MassageApiEnvelope<T>;
  }

  if (cached && cached.staleUntil <= now) {
    massageServerCache.values.delete(cacheKey);
  }

  const existing = massageServerCache.inFlight.get(cacheKey);
  if (existing) return existing as Promise<MassageApiEnvelope<T>>;

  const request = (async () => {
    let lastError: MassageApiError | null = null;
    const requestedMaxAttempts = Number(options.maxAttempts);
    const maxAttempts = Number.isInteger(requestedMaxAttempts)
      ? Math.max(1, Math.min(MASSAGE_API_MAX_ATTEMPTS, requestedMaxAttempts))
      : isMassageReadAction(payload)
        ? MASSAGE_API_MAX_ATTEMPTS
        : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await fetchMassageApiOnce<T>({ config, payload, options });
        clearMassageTransientFailure({ hotelSlug: config.hotelSlug, action: payload.action });
        return result;
      } catch (error) {
        const massageError = error instanceof MassageApiError
          ? error
          : new MassageApiError("Massage calendar service is temporarily unavailable.", {
              statusCode: 502,
              code: "MASSAGE_API_UNAVAILABLE",
            });
        lastError = massageError;

        const staleCached =
          isMassageReadAction(payload) &&
          isTransientMassageApiCode(massageError.code) &&
          cached &&
          cached.staleUntil > Date.now()
            ? cached
            : null;

        if (staleCached) {
          await logMassageApiReadFailure({
            hotelSlug: config.hotelSlug,
            payload,
            error: massageError,
            staleFallbackUsed: true,
            attemptCount: attempt,
          });
          return staleCached.value as MassageApiEnvelope<T>;
        }

        const shouldRetry =
          attempt < maxAttempts &&
          isMassageReadAction(payload) &&
          isTransientMassageApiCode(massageError.code);

        if (shouldRetry) {
          continue;
        }

        if (shouldDeferMassageFailureLogging(options, massageError)) {
          throw massageError;
        }

        const severity = await logMassageApiReadFailure({
          hotelSlug: config.hotelSlug,
          payload,
          error: massageError,
          staleFallbackUsed: false,
          attemptCount: attempt,
        });

        throw new MassageApiError(massageError.message, {
          statusCode: massageError.statusCode,
          code: massageError.code,
          action:
            massageError.action ||
            String(payload.action || "").trim() ||
            null,
          upstreamStatus: massageError.upstreamStatus,
          monitoringSeverity: severity,
          alreadyLogged: true,
        });
      }
    }

    const fallbackError = lastError || new MassageApiError("Massage calendar service is temporarily unavailable.", {
      statusCode: 502,
      code: "MASSAGE_API_UNAVAILABLE",
    });
    if (shouldDeferMassageFailureLogging(options, fallbackError)) {
      throw fallbackError;
    }

    const severity = await logMassageApiReadFailure({
      hotelSlug: config.hotelSlug,
      payload,
      error: fallbackError,
      staleFallbackUsed: false,
      attemptCount: maxAttempts,
    });

    throw new MassageApiError(fallbackError.message, {
      statusCode: fallbackError.statusCode,
      code: fallbackError.code,
      action:
        fallbackError.action ||
        String(payload.action || "").trim() ||
        null,
      upstreamStatus: fallbackError.upstreamStatus,
      monitoringSeverity: severity,
      alreadyLogged: true,
    });
  })();

  massageServerCache.inFlight.set(
    cacheKey,
    request as Promise<MassageApiEnvelope<unknown>>
  );

  try {
    const result = await request;
    if (cacheTtl > 0 || staleCacheTtl > 0) {
      massageServerCache.values.set(cacheKey, {
        expiresAt: Date.now() + cacheTtl,
        staleUntil: Date.now() + Math.max(cacheTtl, staleCacheTtl),
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

export async function getMassageCalendarSnapshot(input: {
  hotelSlug: unknown;
  fromDate: string;
  daysAhead: number;
}) {
  const response = await postMassageApi<MassageCalendarSnapshotResult>(input.hotelSlug, {
    action: "calendar_snapshot",
    fromDate: input.fromDate,
    daysAhead: input.daysAhead,
  });

  return response.result as MassageCalendarSnapshotResult;
}

export async function getMassageSnapshotSourceBundle(input: {
  hotelSlug: unknown;
  fromDate: string;
  daysAhead: number;
}): Promise<MassageSnapshotSourceBundle> {
  // One read-only Apps Script action builds availability and calendar bookings
  // from the same request-scoped weekly-grid context. A client-side abort does
  // not stop Apps Script, so the request remains bounded to one attempt here.
  const snapshotReadOptions: PostMassageApiOptions = {
    timeoutMs: MASSAGE_SNAPSHOT_REFRESH_TIMEOUT_MS,
    maxAttempts: MASSAGE_SNAPSHOT_REFRESH_MAX_ATTEMPTS,
    deferFailureLoggingCodes: ["MASSAGE_API_METHOD_MISMATCH"],
  };
  const bundleResponse = await postMassageApi<MassageSnapshotBundleApiResult>(
    input.hotelSlug,
    {
      action: "snapshot_bundle",
      fromDate: input.fromDate,
      daysAhead: input.daysAhead,
    },
    snapshotReadOptions
  );

  const bundle = bundleResponse.result as MassageSnapshotBundleApiResult;
  const bootstrap = bundle.bootstrap;
  const calendar = bundle.calendar;
  const revision = String(bundle.revision || bootstrap?.revision || "").trim();

  if (!revision || !bootstrap || !calendar || !Array.isArray(calendar.bookings)) {
    throw new MassageApiError("Massage calendar returned an incomplete snapshot bundle.", {
      statusCode: 502,
      code: !revision
        ? "MASSAGE_SNAPSHOT_REVISION_MISSING"
        : "INVALID_MASSAGE_SNAPSHOT_BUNDLE",
      action: "snapshot_bundle",
    });
  }

  const requestId = String(bundleResponse.requestId || "").trim() || null;
  const bundleStatus = String(bundleResponse.status || "").trim() || null;

  return {
    bootstrap,
    calendar,
    source: {
      revision,
      runtimeVersion: String(
        bundle.runtimeVersion || bootstrap.runtimeVersion || bundleResponse.runtimeVersion || ""
      ).trim() || null,
      liveContract: String(
        bundle.liveContract || bootstrap.liveContract || bundleResponse.liveContract || ""
      ).trim() || null,
      requestIds: {
        bootstrap: requestId,
        calendar: requestId,
      },
      statuses: {
        bootstrap: bundleStatus,
        calendar: bundleStatus,
      },
    },
  };
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

export async function getMassageBookableDateSummary(input: {
  hotelSlug: unknown;
  serviceId: string;
  fromDate: string;
  daysAhead: number;
}) {
  const response = await postMassageApi<MassageBookableDatesResult>(input.hotelSlug, {
    action: "bookable_dates_summary",
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

async function waitForMassageVerification(delayMs: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

async function verifyMassageBookingAfterAmbiguousFailure(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
}) {
  const response = await postMassageApi<MassageRecoveredBookingResult | MassageBookingRejectedResult>(
    input.hotelSlug,
    {
      action: "verify_booking",
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
    {
      allowRejectedResult: true,
      suppressFailureLog: true,
      timeoutMs: MASSAGE_VERIFY_TIMEOUT_MS,
      deferFailureLogging: true,
    }
  );

  const result = response.result;
  if (
    response.ok &&
    result &&
    (result.status === "BOOKING_ALREADY_CONFIRMED" ||
      (result as MassageRecoveredBookingResult).verificationStatus === "BOOKING_CONFIRMED")
  ) {
    return {
      kind: "confirmed",
      result: result as MassageRecoveredBookingResult,
    } satisfies MassageBookingVerificationOutcome;
  }

  const rejected = result as MassageBookingRejectedResult | undefined;
  const code = String(rejected?.code || response.code || response.status || "BOOKING_NOT_FOUND");
  const message = String(rejected?.message || response.message || "Massage booking was not found.");

  if (code === "SLOT_OCCUPIED_BY_DIFFERENT_BOOKING" || response.status === "BOOKING_CONFLICT") {
    return { kind: "conflict", code, message } satisfies MassageBookingVerificationOutcome;
  }

  return { kind: "not_found", code, message } satisfies MassageBookingVerificationOutcome;
}

export async function createMassageBooking(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
  deferAmbiguousRecovery?: boolean;
}) {
  let response: MassageApiEnvelope<MassageBookingResult | MassageBookingRejectedResult>;

  try {
    response = await postMassageApi<MassageBookingResult | MassageBookingRejectedResult>(
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
        testMode: false,
      },
      {
        allowRejectedResult: true,
        suppressFailureLog: true,
        timeoutMs: MASSAGE_BOOKING_TIMEOUT_MS,
      }
    );
  } catch (error) {
    const massageError = error instanceof MassageApiError
      ? error
      : new MassageApiError("Massage calendar service is temporarily unavailable.", {
          statusCode: 502,
          code: "MASSAGE_API_UNAVAILABLE",
        });

    const ambiguous = [
      "MASSAGE_API_TIMEOUT",
      "MASSAGE_API_UNAVAILABLE",
      "MASSAGE_API_HTTP_ERROR",
    ].includes(massageError.code);

    if (!ambiguous) {
      throw massageError;
    }

    // Tracked writes have a durable Supabase attempt. Let that layer own the
    // single exact verification and subsequent cron reconciliation instead of
    // racing it with two short, in-memory checks here.
    if (input.deferAmbiguousRecovery) {
      throw massageError;
    }

    const verificationDelaysMs = [500, 1000];
    let lastVerificationError: unknown = null;
    let lastOutcome: MassageBookingVerificationOutcome | null = null;

    for (const delayMs of verificationDelaysMs) {
      await waitForMassageVerification(delayMs);

      try {
        const outcome = await verifyMassageBookingAfterAmbiguousFailure(input);
        lastOutcome = outcome;

        if (outcome.kind === "confirmed") {
          await logSystemError({
            severity: "warning",
            source: "apps_script",
            eventType: "MASSAGE_BOOKING_RECOVERED_AFTER_AMBIGUOUS_FAILURE",
            message: "Massage booking response was ambiguous, but the exact booking was verified in the Google Sheet.",
            error: massageError,
            metadata: {
              hotelSlug: normalizeMassageHotelSlug(input.hotelSlug),
              action: "book",
              recoveryAction: "verify_booking",
              recovered: true,
              room: input.room,
              serviceId: input.serviceId,
              date: input.date,
              time: input.time,
            },
          });
          return outcome.result;
        }

        if (outcome.kind === "conflict") {
          throw new MassageApiError(outcome.message, {
            statusCode: 409,
            code: "SLOT_NO_LONGER_AVAILABLE",
          });
        }
      } catch (verificationError) {
        if (
          verificationError instanceof MassageApiError &&
          verificationError.code === "SLOT_NO_LONGER_AVAILABLE"
        ) {
          throw verificationError;
        }
        lastVerificationError = verificationError;
      }
    }

    if (lastVerificationError) {
      await logSystemError({
        severity: "critical",
        source: "apps_script",
        eventType: "MASSAGE_BOOKING_VERIFICATION_FAILED",
        message: "Massage booking result remained ambiguous after two exact Google Sheet verification attempts.",
        error: lastVerificationError,
        metadata: {
          hotelSlug: normalizeMassageHotelSlug(input.hotelSlug),
          action: "book",
          recoveryAction: "verify_booking",
          verificationAttempts: verificationDelaysMs.length,
          room: input.room,
          serviceId: input.serviceId,
          date: input.date,
          time: input.time,
          originalErrorCode: massageError.code,
        },
      });

      throw new MassageApiError(
        "Massage booking could not be confirmed after verification.",
        {
          statusCode: 504,
          code: "MASSAGE_BOOKING_UNCONFIRMED_AFTER_TIMEOUT",
          monitoringSeverity: "critical",
          alreadyLogged: true,
        }
      );
    }

    await logSystemError({
      severity: "critical",
      source: "apps_script",
      eventType: "MASSAGE_BOOKING_NOT_FOUND_AFTER_AMBIGUOUS_FAILURE",
      message: "Massage booking response was ambiguous and the exact booking was not found in the Google Sheet.",
      error: massageError,
      metadata: {
        hotelSlug: normalizeMassageHotelSlug(input.hotelSlug),
        action: "book",
        recoveryAction: "verify_booking",
        verificationAttempts: verificationDelaysMs.length,
        finalVerificationKind: lastOutcome?.kind || null,
        finalVerificationCode: lastOutcome && "code" in lastOutcome ? lastOutcome.code : null,
        room: input.room,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
      },
    });

    throw new MassageApiError(
      "Massage booking could not be confirmed after verification.",
      {
        statusCode: 504,
        code: "MASSAGE_BOOKING_UNCONFIRMED_AFTER_TIMEOUT",
        monitoringSeverity: "critical",
        alreadyLogged: true,
      }
    );
  }

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

export async function verifyMassageBooking(input: {
  hotelSlug: unknown;
  serviceId: string;
  date: string;
  time: string;
  room: string;
}) {
  const response = await postMassageApi<MassageBookingVerificationResult>(
    input.hotelSlug,
    {
      action: "verify_booking",
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
      testMode: false,
    },
    {
      allowRejectedResult: true,
      deferFailureLogging: true,
    }
  );

  const result = response.result;
  if (!result) {
    throw new MassageApiError("Massage calendar returned an incomplete verification response.", {
      statusCode: 502,
      code: "INVALID_MASSAGE_VERIFICATION_RESPONSE",
    });
  }

  return {
    result,
    source: {
      requestId: String(response.requestId || "").trim() || null,
      runtimeVersion: String(response.runtimeVersion || "").trim() || null,
      status: String(response.status || result.status || "").trim() || null,
    },
  };
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
