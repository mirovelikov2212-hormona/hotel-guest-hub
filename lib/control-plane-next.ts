import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

const ALLOWED_ADMIN_PATHS = [
  "/control-panel",
  "/hotel-factory",
  "/control-plane",
] as const;

function isAllowedPath(pathname: string) {
  return ALLOWED_ADMIN_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function normalizeAdminNextTarget(
  rawValue: unknown,
  lang: ControlPlaneLang,
  fallbackPath = "/control-panel",
) {
  const fallback = `${fallbackPath}?lang=${lang}`;
  const raw = String(rawValue || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;

  try {
    const parsed = new URL(raw, "https://stayhub.invalid");
    if (!isAllowedPath(parsed.pathname)) return fallback;

    parsed.search = "";
    parsed.hash = "";
    parsed.searchParams.set("lang", lang);
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return fallback;
  }
}
