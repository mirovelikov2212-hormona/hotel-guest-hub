export type TrackHubPayload = {
  eventName: string;
  roomNumber?: string | null;
  roomId?: string | null;
  roomConfirmed?: boolean | null;
  roomSource?: string | null;
  eventCategory?: string | null;
  section?: string | null;
  sectionKey?: string | null;
  itemKey?: string | null;
  buttonKey?: string | null;
  label?: string | null;
  value?: string | null;
  language?: string | null;
  page?: string | null;
  pagePath?: string | null;
  requestId?: string | null;
  stayId?: string | null;
  stayDeviceId?: string | null;
  metadata?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

const ROOM_STATE_STORAGE_PREFIX = "guesthub_room_state";
const TRACKING_SESSION_STORAGE_KEY = "sh_tracking_session_id";

function sanitizeHotelSlug(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function inferTrackingEnvironment(hotelAlias: string): "production" | "sandbox" | "demo" {
  const normalized = sanitizeHotelSlug(hotelAlias);
  if (normalized === "demo") return "demo";
  if (normalized.endsWith("-test")) return "sandbox";
  return "production";
}


function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeRoomNumber(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, "");
}

function getHotelAlias(): string {
  if (typeof window === "undefined") return "";

  const host = window.location.hostname.toLowerCase();

  if (
    host.endsWith(".stayhub.app") &&
    host !== "www.stayhub.app" &&
    host !== "stayhub.app"
  ) {
    return sanitizeHotelSlug(host.replace(".stayhub.app", ""));
  }

  const match = window.location.pathname.match(/^\/h\/([^/]+)/);
  if (match?.[1]) return sanitizeHotelSlug(match[1]);

  return "";
}

function getRoomStateLookupKeys(hotelAlias: string, hotelSlug: string) {
  if (typeof window === "undefined") return [];

  const keys = new Set<string>();
  const pathMatch = window.location.pathname.match(/^\/h\/([^/]+)/i);

  if (pathMatch?.[1]) keys.add(String(pathMatch[1]).trim().toLowerCase());

  const host = window.location.hostname.toLowerCase();
  if (host.endsWith(".stayhub.app")) {
    const sub = host.split(".")[0];
    if (sub && sub !== "www") keys.add(sub);
  }

  if (hotelAlias) keys.add(String(hotelAlias).trim().toLowerCase());
  if (hotelSlug) keys.add(String(hotelSlug).trim().toLowerCase());

  return Array.from(keys).filter(Boolean);
}

function getHotelSlug(alias: string): string {
  // Client-side tracking deliberately sends the visible hotel slug/alias only.
  // The API resolves it against Supabase hotels.slug/public_slug and stores the canonical DB slug.
  // This avoids hardcoded hotel IDs/slugs in the guest bundle and keeps tracking multi-hotel ready.
  return sanitizeHotelSlug(alias);
}

function getStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch { }
}

function readStoredRoomState(hotelAlias: string, hotelSlug: string): {
  room: string | null;
  roomConfirmed: boolean;
} {
  if (typeof window === "undefined") return { room: null, roomConfirmed: false };

  for (const key of getRoomStateLookupKeys(hotelAlias, hotelSlug)) {
    try {
      const raw = window.localStorage.getItem(`${ROOM_STATE_STORAGE_PREFIX}:${key}`);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as { room?: unknown; roomConfirmed?: unknown };
      const room = normalizeRoomNumber(parsed?.room);
      const roomConfirmed = Boolean(parsed?.roomConfirmed);

      if (room && roomConfirmed) return { room, roomConfirmed };
      if (room) return { room, roomConfirmed: false };
    } catch { }
  }

  return { room: null, roomConfirmed: false };
}

function getOrCreateTrackingSessionId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.sessionStorage.getItem(TRACKING_SESSION_STORAGE_KEY);
    if (existing) return existing;

    const next =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    window.sessionStorage.setItem(TRACKING_SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

function getDeviceInfo() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceType: null,
      osFamily: null,
      browserFamily: null,
      pwaMode: null,
      screenSizeGroup: null,
    };
  }

  const ua = String(navigator.userAgent || "").toLowerCase();
  const width = window.innerWidth || 0;

  const isTablet = /ipad|tablet/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua));
  const isMobile = !isTablet && /mobi|iphone|ipod|android/.test(ua);

  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  const osFamily = /iphone|ipad|ipod/.test(ua)
    ? "iOS"
    : /android/.test(ua)
      ? "Android"
      : /windows/.test(ua)
        ? "Windows"
        : /mac os|macintosh/.test(ua)
          ? "macOS"
          : /linux/.test(ua)
            ? "Linux"
            : "Other";

  const browserFamily = /edg\//.test(ua)
    ? "Edge"
    : /samsungbrowser/.test(ua)
      ? "Samsung Internet"
      : /firefox|fxios/.test(ua)
        ? "Firefox"
        : /crios|chrome|chromium/.test(ua)
          ? "Chrome"
          : /safari/.test(ua)
            ? "Safari"
            : "Other";

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  const pwaMode = standalone ? "installed_pwa" : "browser";
  const screenSizeGroup = width <= 480 ? "small" : width <= 900 ? "medium" : "large";

  return { deviceType, osFamily, browserFamily, pwaMode, screenSizeGroup };
}

function getCurrentPagePath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function resolveRoomContext(payload: TrackHubPayload, hotelAlias: string, hotelSlug: string) {
  if (typeof window === "undefined") {
    return { roomNumber: payload.roomNumber ?? null, roomConfirmed: Boolean(payload.roomConfirmed), roomSource: payload.roomSource ?? null };
  }

  const url = new URL(window.location.href);
  const payloadRoom = normalizeRoomNumber(payload.roomNumber);
  const roomFromUrl = normalizeRoomNumber(url.searchParams.get("room"));
  const storedRoomState = readStoredRoomState(hotelAlias, hotelSlug);
  const storedRoom = normalizeRoomNumber(storedRoomState.room);

  const roomNumber = payloadRoom || roomFromUrl || storedRoom || null;

  let roomConfirmed = Boolean(payload.roomConfirmed);
  if (typeof payload.roomConfirmed !== "boolean") {
    if (payload.eventName === "room_confirmed" || payload.eventName === "room_changed") {
      roomConfirmed = true;
    } else if (
      payload.eventName === "room_confirm_prompt_shown" ||
      payload.eventName === "room_confirm_rejected"
    ) {
      roomConfirmed = false;
    } else {
      roomConfirmed = Boolean(roomNumber && storedRoomState.roomConfirmed && storedRoom === roomNumber);
    }
  }

  const roomSource =
    payload.roomSource ??
    (payloadRoom
      ? roomConfirmed
        ? "confirmed"
        : "payload"
      : roomFromUrl
        ? "url_param"
        : storedRoom
          ? "stored_confirmed"
          : null);

  return { roomNumber, roomConfirmed, roomSource };
}

export function persistQrContextFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  const qsid = url.searchParams.get("qsid");
  const src = url.searchParams.get("src");
  const code = url.searchParams.get("code");

  if (qsid) setStoredValue("sh_qsid", qsid);
  if (src) setStoredValue("sh_src", src);
  if (code) setStoredValue("sh_qrcode", code);
}

export async function trackHubEvent(payload: TrackHubPayload) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  const hotelAlias = getHotelAlias();
  const hotelSlug = getHotelSlug(hotelAlias);
  if (!hotelAlias || !hotelSlug) return;
  const { roomNumber, roomConfirmed, roomSource } = resolveRoomContext(payload, hotelAlias, hotelSlug);
  const environment = inferTrackingEnvironment(hotelAlias);
  const sessionId = getOrCreateTrackingSessionId();
  const device = getDeviceInfo();

  const scanSessionId =
    url.searchParams.get("qsid") ||
    getStoredValue("sh_qsid") ||
    readCookie("sh_qr_sid") ||
    null;

  const src =
    url.searchParams.get("src") ||
    getStoredValue("sh_src") ||
    readCookie("sh_qr_src") ||
    null;

  const qrCode =
    url.searchParams.get("code") ||
    getStoredValue("sh_qrcode") ||
    readCookie("sh_qr_code") ||
    null;

  const pagePath = payload.pagePath ?? payload.page ?? getCurrentPagePath();
  const legacyExtra = {
    ...(payload.extra ?? {}),
    qrCode,
    roomSource,
    roomConfirmed,
    environment,
    language: payload.language ?? null,
    deviceType: device.deviceType,
    osFamily: device.osFamily,
    browserFamily: device.browserFamily,
    pwaMode: device.pwaMode,
    screenSizeGroup: device.screenSizeGroup,
    sessionId,
  };

  const metadata = {
    ...(payload.metadata ?? {}),
    ...(payload.extra ?? {}),
  };

  const body = JSON.stringify({
    hotelId: null,
    hotelSlug,
    hotelAlias,
    environment,
    scanSessionId,
    roomId: payload.roomId ?? null,
    roomNumber,
    userSessionId: sessionId,
    sessionId,
    eventName: payload.eventName,
    eventCategory: payload.eventCategory ?? null,
    section: payload.section ?? payload.sectionKey ?? null,
    sectionKey: payload.sectionKey ?? payload.section ?? null,
    itemKey: payload.itemKey ?? null,
    buttonKey: payload.buttonKey ?? null,
    label: payload.label ?? null,
    value: payload.value ?? null,
    language: payload.language ?? null,
    requestId: payload.requestId ?? null,
    stayId: payload.stayId ?? null,
    stayDeviceId: payload.stayDeviceId ?? null,
    roomSource,
    roomConfirmed,
    deviceType: device.deviceType,
    osFamily: device.osFamily,
    browserFamily: device.browserFamily,
    pwaMode: device.pwaMode,
    screenSizeGroup: device.screenSizeGroup,
    src,
    page: pagePath,
    pagePath,
    metadata,
    extra: legacyExtra,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/track", blob);
    return;
  }

  await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}
