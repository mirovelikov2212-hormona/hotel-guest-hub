import "server-only";

import { getHotelConfig } from "@/lib/config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const RUNTIME_BRANDING_STATUSES = new Set(["active", "published", "ready", "configured"]);

export type StaffHotelBrand = {
  hotelName: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  soft: string;
  surface: string;
  onBrand: "#FFFFFF" | "#102027";
  coverImage: string | null;
  logoUrl: string | null;
  source: "hotel_branding_configs" | "published_hotel_config" | "stayhub_default";
};

type BrandingRow = {
  status: string | null;
  config_json: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function color(value: unknown, fallback: string) {
  const normalized = String(value || "").trim();
  return HEX_COLOR.test(normalized) ? normalized.toUpperCase() : fallback;
}

function colorLuminance(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function onBrandColor(primary: string): StaffHotelBrand["onBrand"] {
  return colorLuminance(primary) >= 0.42 ? "#102027" : "#FFFFFF";
}

function optionalUrl(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("/")) return normalized;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function themeValue(theme: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = theme[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return undefined;
}

function brandingFromRow(row: BrandingRow | null, hotelName: string): StaffHotelBrand | null {
  if (!row || !RUNTIME_BRANDING_STATUSES.has(String(row.status || "").trim().toLowerCase())) return null;
  const config = asRecord(row.config_json);
  const theme = asRecord(config.theme);
  const hasRuntimeColor = [
    themeValue(theme, "primary", "primaryColor"),
    themeValue(theme, "accent", "accentColor"),
    themeValue(theme, "secondary", "secondaryColor"),
  ].some((value) => HEX_COLOR.test(String(value || "").trim()));
  if (!hasRuntimeColor) return null;

  const primary = color(themeValue(theme, "primary", "primaryColor"), "#2563EB");
  return {
    hotelName: String(config.display_name || config.displayName || hotelName || "Hotel").trim() || "Hotel",
    primary,
    secondary: color(themeValue(theme, "secondary", "secondaryColor"), primary),
    accent: color(themeValue(theme, "accent", "accentColor"), primary),
    background: color(themeValue(theme, "background", "backgroundColor"), "#F7F8FA"),
    soft: color(themeValue(theme, "soft", "softColor"), "#F3F4F6"),
    surface: color(themeValue(theme, "surface", "surfaceColor"), "#FFFFFF"),
    onBrand: onBrandColor(primary),
    coverImage: optionalUrl(config.cover_image || config.coverImage),
    logoUrl: optionalUrl(config.logo_url || config.logoUrl),
    source: "hotel_branding_configs",
  };
}

export async function resolveStaffHotelBrand(input: {
  hotelId: string;
  hotelSlug: string;
  hotelName: string;
}): Promise<StaffHotelBrand> {
  const { data: brandingData, error: brandingError } = await supabaseAdmin
    .from("hotel_branding_configs")
    .select("status, config_json")
    .eq("hotel_id", input.hotelId)
    .maybeSingle();

  if (brandingError) {
    console.warn("Staff hotel branding lookup failed; using published hotel theme", {
      hotelId: input.hotelId,
      hotelSlug: input.hotelSlug,
      error: brandingError.message,
    });
  }

  const configuredBrand = brandingFromRow((brandingData as BrandingRow | null) ?? null, input.hotelName);
  if (configuredBrand) return configuredBrand;

  const config = await getHotelConfig(input.hotelSlug).catch((error) => {
    console.warn("Staff published hotel theme lookup failed; using StayHub defaults", {
      hotelId: input.hotelId,
      hotelSlug: input.hotelSlug,
      error,
    });
    return null;
  });

  if (config) {
    const primary = color(config.theme?.primary, "#2563EB");
    return {
      hotelName: String(config.hotelName || input.hotelName || "Hotel").trim() || "Hotel",
      primary,
      secondary: color(config.theme?.secondary, primary),
      accent: color(config.theme?.accent, primary),
      background: color(config.theme?.background, "#F7F8FA"),
      soft: color(config.theme?.soft, "#F3F4F6"),
      surface: color(config.theme?.surface, "#FFFFFF"),
      onBrand: onBrandColor(primary),
      coverImage: optionalUrl(config.coverImage),
      logoUrl: null,
      source: "published_hotel_config",
    };
  }

  return {
    hotelName: input.hotelName || "Hotel",
    primary: "#2563EB",
    secondary: "#0EA5E9",
    accent: "#14B8A6",
    background: "#F7F8FA",
    soft: "#F3F4F6",
    surface: "#FFFFFF",
    onBrand: "#FFFFFF",
    coverImage: null,
    logoUrl: null,
    source: "stayhub_default",
  };
}
