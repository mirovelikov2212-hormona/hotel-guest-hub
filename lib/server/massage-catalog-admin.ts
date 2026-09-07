import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type MassageCatalogHotel = {
  id: string;
  name: string;
  slug: string;
  publicSlug: string | null;
  active: boolean;
  isSandbox: boolean;
};

export type MassageCatalogService = {
  serviceId: string;
  active: boolean;
  nameI18n: Record<string, string>;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  currency: string;
  sortOrder: number;
  sourceKind: string;
  updatedAt: string;
};

export type MassageCatalogServiceInput = {
  hotelId: string;
  serviceId: string;
  active: boolean;
  nameI18n: Record<string, string>;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  currency: string;
  sortOrder: number;
};

function normalizeTranslations(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const lang = String(key || "").trim();
    const text = String(rawValue || "").trim();
    if (lang && text) result[lang] = text;
  }
  return result;
}

function legacyTranslations(row: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const lang of ["bg", "en", "de", "ro", "cs", "ru"] as const) {
    const text = String(row[`name_${lang}`] || "").trim();
    if (text) result[lang] = text;
  }
  return result;
}

export async function listMassageCatalogHotels(): Promise<MassageCatalogHotel[]> {
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, name, slug, public_slug, active, is_sandbox")
    .order("is_sandbox", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`MASSAGE_CATALOG_HOTELS_LOOKUP_FAILED:${error.message}`);

  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name || row.slug),
    slug: String(row.slug),
    publicSlug: String(row.public_slug || "").trim() || null,
    active: Boolean(row.active),
    isSandbox: Boolean(row.is_sandbox),
  }));
}

export async function listMassageCatalogServices(hotelId: string): Promise<MassageCatalogService[]> {
  const scope = String(hotelId || "").trim();
  if (!scope) return [];

  const { data, error } = await supabaseAdmin
    .from("massage_runtime_services")
    .select("service_id, active, name_bg, name_en, name_de, name_ro, name_cs, name_ru, name_i18n, duration_minutes, buffer_minutes, price, currency, sort_order, source_kind, updated_at")
    .eq("hotel_id", scope)
    .order("sort_order", { ascending: true })
    .order("service_id", { ascending: true });

  if (error) throw new Error(`MASSAGE_CATALOG_SERVICES_LOOKUP_FAILED:${error.message}`);

  return (data || []).map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const nameI18n = {
      ...legacyTranslations(row),
      ...normalizeTranslations(row.name_i18n),
    };
    return {
      serviceId: String(row.service_id),
      active: Boolean(row.active),
      nameI18n,
      durationMinutes: Number(row.duration_minutes),
      bufferMinutes: Number(row.buffer_minutes),
      price: Number(row.price),
      currency: String(row.currency || "EUR"),
      sortOrder: Number(row.sort_order),
      sourceKind: String(row.source_kind || ""),
      updatedAt: String(row.updated_at || ""),
    };
  });
}

export async function upsertMassageCatalogService(input: {
  authority: PlatformAdminAuthority;
  service: MassageCatalogServiceInput;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("MASSAGE_CATALOG_ADMIN_FORBIDDEN");
  }

  const service = input.service;
  const { data, error } = await supabaseAdmin.rpc("upsert_massage_catalog_service_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_hotel_id: service.hotelId,
    p_service_id: service.serviceId,
    p_active: service.active,
    p_name_i18n: service.nameI18n,
    p_duration_minutes: service.durationMinutes,
    p_buffer_minutes: service.bufferMinutes,
    p_price: service.price,
    p_currency: service.currency,
    p_sort_order: service.sortOrder,
  });

  if (error) throw new Error(`MASSAGE_CATALOG_UPSERT_FAILED:${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("MASSAGE_CATALOG_UPSERT_INVALID_RESULT");
  }

  const result = data as Record<string, unknown>;
  if (
    result.ok !== true
    || String(result.hotelId || "") !== service.hotelId
    || String(result.serviceId || "") !== service.serviceId.trim().toLowerCase()
    || result.catalogAuthority !== "stayhub"
  ) {
    throw new Error("MASSAGE_CATALOG_UPSERT_SCOPE_MISMATCH");
  }

  await logSystemEvent({
    hotelId: service.hotelId,
    severity: "info",
    source: "massage",
    eventType: "massage_catalog_service_updated",
    message: `Central massage catalogue service ${String(result.serviceId)} was ${result.created === true ? "created" : "updated"}.`,
    metadata: {
      actorAdminId: input.authority.adminId,
      serviceId: String(result.serviceId),
      created: result.created === true,
      before: result.before ?? null,
      after: result.after ?? null,
      catalogAuthority: "stayhub",
    },
  });

  return result;
}
