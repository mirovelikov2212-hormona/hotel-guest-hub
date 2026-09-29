export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform?: string;
  }>;
};

type InstallWindow = Window & {
  __gostayaGuestInstallPrompt?: BeforeInstallPromptEvent | null;
  __gostayaGuestAppInstalled?: boolean;
};

export const GUEST_INSTALL_PROMPT_EVENT = "gostaya:guest-install-prompt";
export const GUEST_APP_INSTALLED_EVENT = "gostaya:guest-app-installed";
const GUEST_APP_INSTALLED_STORAGE_PREFIX = "gostaya_guest_app_installed";

function installedStorageKey() {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/h\/([^/?#]+)/i);
  const hotelSlug = String(match?.[1] || "").trim().toLowerCase();
  return hotelSlug ? `${GUEST_APP_INSTALLED_STORAGE_PREFIX}:${hotelSlug}` : null;
}

function installWindow() {
  if (typeof window === "undefined") return null;
  return window as InstallWindow;
}

export function getGuestInstallPrompt() {
  return installWindow()?.__gostayaGuestInstallPrompt ?? null;
}

export function storeGuestInstallPrompt(event: BeforeInstallPromptEvent) {
  const target = installWindow();
  if (!target) return;
  target.__gostayaGuestInstallPrompt = event;
  target.dispatchEvent(new CustomEvent(GUEST_INSTALL_PROMPT_EVENT));
}

export function clearGuestInstallPrompt() {
  const target = installWindow();
  if (!target) return;
  target.__gostayaGuestInstallPrompt = null;
}

export function markGuestAppInstalled() {
  const target = installWindow();
  if (!target) return;

  target.__gostayaGuestAppInstalled = true;
  target.__gostayaGuestInstallPrompt = null;

  const key = installedStorageKey();
  if (key) {
    try {
      window.localStorage.setItem(key, "1");
    } catch {}
  }

  target.dispatchEvent(new CustomEvent(GUEST_APP_INSTALLED_EVENT));
}

export function wasGuestAppInstalled() {
  if (installWindow()?.__gostayaGuestAppInstalled) return true;

  const key = installedStorageKey();
  if (!key) return false;

  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;

  const ua = String(navigator.userAgent || "").toLowerCase();
  const iOS = /iphone|ipad|ipod/.test(ua);
  const iPadDesktopUa = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadDesktopUa;
}

export function guestInstallBrowserFamily() {
  if (typeof navigator === "undefined") return "other" as const;

  const ua = String(navigator.userAgent || "").toLowerCase();
  if (/samsungbrowser/.test(ua)) return "samsung" as const;
  if (/edg\//.test(ua) || /edga\//.test(ua)) return "edge" as const;
  if (/crios|chrome|chromium/.test(ua)) return "chrome" as const;
  if (/safari/.test(ua)) return "safari" as const;
  if (/firefox|fxios/.test(ua)) return "firefox" as const;
  return "other" as const;
}
