export const CONTROL_PLANE_LANGS = ["bg", "en"] as const;

export type ControlPlaneLang = (typeof CONTROL_PLANE_LANGS)[number];

export function normalizeControlPlaneLang(value: unknown): ControlPlaneLang {
  return String(value || "").trim().toLowerCase() === "en" ? "en" : "bg";
}

export function controlPlaneHref(path: string, lang: ControlPlaneLang) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${lang}`;
}
