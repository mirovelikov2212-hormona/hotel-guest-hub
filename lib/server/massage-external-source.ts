import "server-only";

import { resolveHotelByAnySlugAdmin, type HotelScope } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type MassageExternalSourceConfig = {
  hotel_id: string;
  source_hotel_id: string | null;
  adapter_key: string;
  hotel_code: string;
  read_enabled: boolean;
  mirror_enabled: boolean;
  active: boolean;
  metadata_json: Record<string, unknown> | null;
};

export type MassageExternalSource = {
  hotel: HotelScope;
  config: MassageExternalSourceConfig;
};

function normalizeAdapterKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function adapterEnvSuffix(value: unknown) {
  return normalizeAdapterKey(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function normalizeHotelCode(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
}

export async function getMassageExternalSourceForHotel(
  inputHotelSlug: unknown,
): Promise<MassageExternalSource | null> {
  const hotel = await resolveHotelByAnySlugAdmin(String(inputHotelSlug || "").trim());

  const { data, error } = await supabaseAdmin
    .from("massage_external_source_configs")
    .select(
      "hotel_id, source_hotel_id, adapter_key, hotel_code, read_enabled, mirror_enabled, active, metadata_json",
    )
    .eq("hotel_id", hotel.id)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const config = data as MassageExternalSourceConfig;
  const adapterKey = normalizeAdapterKey(config.adapter_key);
  const hotelCode = normalizeHotelCode(config.hotel_code);
  if (!adapterKey || !hotelCode) return null;

  return {
    hotel,
    config: {
      ...config,
      adapter_key: adapterKey,
      hotel_code: hotelCode,
    },
  };
}

export async function listMassageExternalReadHotels(): Promise<MassageExternalSource[]> {
  const { data: configs, error } = await supabaseAdmin
    .from("massage_external_source_configs")
    .select(
      "hotel_id, source_hotel_id, adapter_key, hotel_code, read_enabled, mirror_enabled, active, metadata_json",
    )
    .eq("active", true)
    .eq("read_enabled", true)
    .order("hotel_id", { ascending: true });

  if (error) throw error;
  const rows = (configs || []) as MassageExternalSourceConfig[];
  if (!rows.length) return [];

  const hotelIds = rows.map((row) => row.hotel_id);
  const { data: hotels, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, timezone, active, is_sandbox, production_hotel_id")
    .in("id", hotelIds)
    .eq("active", true);

  if (hotelError) throw hotelError;
  const hotelById = new Map(
    (hotels || []).map((hotel) => [String(hotel.id), hotel as HotelScope]),
  );

  return rows.flatMap((row) => {
    const hotel = hotelById.get(row.hotel_id);
    const adapterKey = normalizeAdapterKey(row.adapter_key);
    const hotelCode = normalizeHotelCode(row.hotel_code);
    if (!hotel || !adapterKey || !hotelCode) return [];

    return [{
      hotel,
      config: {
        ...row,
        adapter_key: adapterKey,
        hotel_code: hotelCode,
      },
    }];
  });
}

export function getMassageExternalAdapterCredentials(adapterKey: unknown) {
  const normalized = normalizeAdapterKey(adapterKey);
  if (!normalized) return { url: "", token: "" };

  // Compatibility adapter for the one legacy Apps Script endpoint. Crucially,
  // this global credential pair is reachable only when a tenant DB row explicitly
  // selects adapter_key=legacy_global; unknown/new hotels cannot inherit it.
  if (normalized === "legacy_global") {
    return {
      url: String(process.env.STAYHUB_MASSAGE_API_URL || "").trim(),
      token: String(process.env.STAYHUB_MASSAGE_API_TOKEN || "").trim(),
    };
  }

  const suffix = adapterEnvSuffix(normalized);
  return {
    url: String(process.env[`STAYHUB_MASSAGE_API_URL_${suffix}`] || "").trim(),
    token: String(process.env[`STAYHUB_MASSAGE_API_TOKEN_${suffix}`] || "").trim(),
  };
}
