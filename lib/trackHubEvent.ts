export type TrackHubPayload = {
  eventName: string;
  roomNumber?: string | null;
  section?: string | null;
  label?: string | null;
  value?: string | null;
  page?: string | null;
  extra?: Record<string, unknown>;
};

type UiAlias = "aquamarine" | "demo";

const ALIAS_TO_SLUG: Record<UiAlias, string> = {
  aquamarine: "aquamarin",
  demo: "demo",
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function getHotelAlias(): string {
  if (typeof window === "undefined") return "aquamarine";

  const host = window.location.hostname.toLowerCase();

  if (
    host.endsWith(".stayhub.app") &&
    host !== "www.stayhub.app" &&
    host !== "stayhub.app"
  ) {
    return host.replace(".stayhub.app", "");
  }

  const match = window.location.pathname.match(/^\/h\/([^/]+)/);
  if (match?.[1] === "aquamarin") return "aquamarine";
  if (match?.[1]) return match[1];

  return "aquamarine";
}

function getHotelSlug(alias: string): string {
  if (alias in ALIAS_TO_SLUG) {
    return ALIAS_TO_SLUG[alias as UiAlias];
  }
  return alias;
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
  } catch {}
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

  const body = JSON.stringify({
    hotelId: null,
    hotelSlug,
    hotelAlias,
    scanSessionId,
    roomNumber: payload.roomNumber ?? null,
    eventName: payload.eventName,
    section: payload.section ?? null,
    label: payload.label ?? null,
    value: payload.value ?? null,
    src,
    page: payload.page ?? window.location.pathname,
    extra: {
      ...(payload.extra ?? {}),
      qrCode,
    },
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