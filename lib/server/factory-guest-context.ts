import "server-only";

import {
  CommercialRuntimeAccessDeniedError,
  type CommercialRuntimeEffectiveStatus,
} from "@/lib/server/commercial-runtime-entitlement";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, unknown>;

export type FactoryGuestRuntime = {
  status: "ready";
  hotelId: string;
  hotelSlug: string;
  publicSlug: string | null;
  isSandbox: true;
  productionHotelId: string | null;
  publishedRevisionId: string;
  sourceChecksum: string;
  config: JsonObject;
  relationalAuthority: JsonObject;
  testRoomNumbers: string[];
  hotelName: string | null;
  hotelTimezone: string | null;
  configUrl: string | null;
  venuesUrl: string | null;
  i18nUrl: string | null;
  hotelSetupUrl: string | null;
  requestDefsUrl: string | null;
  factorySandboxAcceptanceCertified: boolean;
};

export type FactoryGuestHotelScope = {
  id: string;
  slug: string;
  public_slug: string | null;
  name: string | null;
  timezone: string | null;
  active: true;
  is_sandbox: true;
  production_hotel_id: string | null;
};

type FactoryGuestWriteIdentityResult =
  | { kind: "ready"; stay: JsonObject; device: JsonObject; roomId: string }
  | { kind: "missing" }
  | { kind: "stay_ended" };

const runtimeByHotelId = new Map<string, FactoryGuestRuntime>();
const runtimeBySlug = new Map<string, FactoryGuestRuntime>();

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeSlug(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function normalizeRoom(value: unknown) {
  return normalizeString(value).replace(/\s+/g, "");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseRuntime(value: unknown): FactoryGuestRuntime {
  if (!isObject(value) || value.status !== "ready" || value.isSandbox !== true) {
    throw new Error("FACTORY_GUEST_RUNTIME_INVALID");
  }

  const hotelId = normalizeString(value.hotelId);
  const hotelSlug = normalizeSlug(value.hotelSlug);
  const publicSlug = normalizeNullableString(value.publicSlug);
  const productionHotelId = normalizeNullableString(value.productionHotelId);
  const publishedRevisionId = normalizeString(value.publishedRevisionId);
  const sourceChecksum = normalizeString(value.sourceChecksum).toLowerCase();
  const config = isObject(value.config) ? value.config : null;
  const relationalAuthority = isObject(value.relationalAuthority)
    ? value.relationalAuthority
    : null;
  const relationalRevisionId = normalizeString(relationalAuthority?.revisionId);
  const relationalChecksum = normalizeString(relationalAuthority?.sourceChecksum).toLowerCase();

  if (
    !isUuid(hotelId) ||
    !hotelSlug ||
    !isUuid(publishedRevisionId) ||
    !/^[a-f0-9]{64}$/.test(sourceChecksum) ||
    !config ||
    !relationalAuthority ||
    relationalRevisionId !== publishedRevisionId ||
    relationalChecksum !== sourceChecksum
  ) {
    throw new Error("FACTORY_GUEST_RUNTIME_AUTHORITY_INVALID");
  }

  const testRoomNumbers = Array.isArray(value.testRoomNumbers)
    ? Array.from(
        new Set(
          value.testRoomNumbers
            .map(normalizeRoom)
            .filter(Boolean),
        ),
      ).sort()
    : [];

  return {
    status: "ready",
    hotelId,
    hotelSlug,
    publicSlug: publicSlug ? publicSlug.toLowerCase() : null,
    isSandbox: true,
    productionHotelId,
    publishedRevisionId,
    sourceChecksum,
    config,
    relationalAuthority,
    testRoomNumbers,
    hotelName: normalizeNullableString(value.hotelName),
    hotelTimezone: normalizeNullableString(value.hotelTimezone),
    configUrl: normalizeNullableString(value.configUrl),
    venuesUrl: normalizeNullableString(value.venuesUrl),
    i18nUrl: normalizeNullableString(value.i18nUrl),
    hotelSetupUrl: normalizeNullableString(value.hotelSetupUrl),
    requestDefsUrl: normalizeNullableString(value.requestDefsUrl),
    factorySandboxAcceptanceCertified:
      value.factorySandboxAcceptanceCertified === true,
  };
}

function rememberRuntime(runtime: FactoryGuestRuntime) {
  runtimeByHotelId.set(runtime.hotelId, runtime);
  runtimeBySlug.set(runtime.hotelSlug, runtime);
  if (runtime.publicSlug) runtimeBySlug.set(runtime.publicSlug, runtime);
}

function throwCommercialBlocked(payload: JsonObject) {
  const hotelId = normalizeString(payload.hotelId);
  const entitlement = isObject(payload.entitlement) ? payload.entitlement : {};
  const effectiveStatus = normalizeString(entitlement.effectiveStatus) as CommercialRuntimeEffectiveStatus;
  const reason = normalizeString(entitlement.reason) || "commercial_runtime_access_blocked";
  if (!isUuid(hotelId) || !effectiveStatus) {
    throw new Error("FACTORY_GUEST_COMMERCIAL_RESULT_INVALID");
  }
  throw new CommercialRuntimeAccessDeniedError({ hotelId, effectiveStatus, reason });
}

function isMissingRpc(error: { message?: string } | null | undefined, functionName: string) {
  const message = normalizeString(error?.message).toLowerCase();
  return (
    message.includes(functionName.toLowerCase()) &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find"))
  );
}

export function getPrimedFactoryRuntimeBySlug(inputSlug: string) {
  return runtimeBySlug.get(normalizeSlug(inputSlug)) || null;
}

export function getPrimedFactoryRuntimeByHotelId(hotelId: string) {
  return runtimeByHotelId.get(normalizeString(hotelId)) || null;
}

export function getPrimedFactoryTestRoomNumbersForHotelIds(
  hotelIds: Array<string | null | undefined>,
) {
  const normalizedIds = Array.from(
    new Set(hotelIds.map(normalizeString).filter(Boolean)),
  ).sort();
  if (!normalizedIds.length) return null;

  for (const runtime of runtimeByHotelId.values()) {
    const authorityIds = [runtime.hotelId, runtime.productionHotelId]
      .map(normalizeString)
      .filter(Boolean)
      .sort();
    if (
      normalizedIds.includes(runtime.hotelId) &&
      normalizedIds.length === authorityIds.length &&
      normalizedIds.every((value, index) => value === authorityIds[index])
    ) {
      return [...runtime.testRoomNumbers];
    }
  }
  return null;
}

export async function resolveFactoryGuestScopeFastPath(
  hotelSlugInput: string,
): Promise<{ hotel: FactoryGuestHotelScope; runtime: FactoryGuestRuntime } | null> {
  const hotelSlug = normalizeSlug(hotelSlugInput);
  if (!hotelSlug) return null;

  const { data, error } = await supabaseAdmin.rpc("get_factory_guest_scope_v1", {
    p_hotel_slug: hotelSlug,
  });

  if (error) {
    if (!isMissingRpc(error, "get_factory_guest_scope_v1")) {
      console.warn("Factory guest scope fast path unavailable; using legacy scope", {
        hotelSlug,
        error,
      });
    }
    return null;
  }

  if (data == null) return null;
  if (!isObject(data)) throw new Error("FACTORY_GUEST_SCOPE_RESULT_INVALID");
  if (data.status === "commercial_blocked") throwCommercialBlocked(data);
  if (data.status !== "ready") return null;

  const runtime = parseRuntime(data.runtime);
  const hotelPayload = isObject(data.hotel) ? data.hotel : null;
  if (!hotelPayload) throw new Error("FACTORY_GUEST_SCOPE_HOTEL_INVALID");

  const hotelId = normalizeString(hotelPayload.id);
  const canonicalSlug = normalizeSlug(hotelPayload.slug);
  if (hotelId !== runtime.hotelId || canonicalSlug !== runtime.hotelSlug) {
    throw new Error("FACTORY_GUEST_SCOPE_MISMATCH");
  }

  const hotel: FactoryGuestHotelScope = {
    id: hotelId,
    slug: canonicalSlug,
    public_slug: normalizeNullableString(hotelPayload.public_slug),
    name: normalizeNullableString(hotelPayload.name),
    timezone: normalizeNullableString(hotelPayload.timezone),
    active: true,
    is_sandbox: true,
    production_hotel_id: normalizeNullableString(hotelPayload.production_hotel_id),
  };

  rememberRuntime(runtime);
  return { hotel, runtime };
}

export async function resolveFactoryGuestWriteIdentity(input: {
  hotelId: string;
  room: string;
  stayId?: unknown;
  stayDeviceId?: unknown;
}): Promise<FactoryGuestWriteIdentityResult | null> {
  const hotelId = normalizeString(input.hotelId);
  const room = normalizeRoom(input.room);
  const stayId = normalizeString(input.stayId);
  const stayDeviceId = normalizeString(input.stayDeviceId);
  const runtime = getPrimedFactoryRuntimeByHotelId(hotelId);

  if (!runtime || !room || !isUuid(stayId) || !isUuid(stayDeviceId)) return null;

  const { data, error } = await supabaseAdmin.rpc(
    "get_factory_guest_write_context_v1",
    {
      p_hotel_slug: runtime.hotelSlug,
      p_room_number: room,
      p_stay_id: stayId,
      p_stay_device_id: stayDeviceId,
    },
  );

  if (error) {
    if (!isMissingRpc(error, "get_factory_guest_write_context_v1")) {
      console.warn("Factory guest write context unavailable; using legacy stay validation", {
        hotelId,
        hotelSlug: runtime.hotelSlug,
        error,
      });
    }
    return null;
  }

  if (data == null) return null;
  if (!isObject(data)) throw new Error("FACTORY_GUEST_WRITE_CONTEXT_INVALID");
  if (data.status === "commercial_blocked") throwCommercialBlocked(data);
  if (data.status === "fallback_required") return null;
  if (data.status === "invalid_room" || data.status === "stay_required") {
    return { kind: "missing" };
  }
  if (data.status === "stay_ended") return { kind: "stay_ended" };
  if (data.status !== "ready") throw new Error("FACTORY_GUEST_WRITE_CONTEXT_STATUS_INVALID");

  const contextRuntime = parseRuntime(data.runtime);
  if (contextRuntime.hotelId !== hotelId) {
    throw new Error("FACTORY_GUEST_WRITE_CONTEXT_SCOPE_MISMATCH");
  }
  rememberRuntime(contextRuntime);

  const stay = isObject(data.stay) ? data.stay : null;
  const device = isObject(data.device) ? data.device : null;
  const roomId = normalizeString(data.roomId);
  if (
    !stay ||
    !device ||
    !isUuid(roomId) ||
    normalizeString(stay.id) !== stayId ||
    normalizeString(stay.hotel_id) !== hotelId ||
    normalizeRoom(stay.room_number) !== room ||
    normalizeString(device.id) !== stayDeviceId ||
    normalizeString(device.stay_id) !== stayId ||
    normalizeString(device.hotel_id) !== hotelId ||
    normalizeRoom(device.room_number) !== room
  ) {
    throw new Error("FACTORY_GUEST_WRITE_CONTEXT_IDENTITY_MISMATCH");
  }

  return { kind: "ready", stay, device, roomId };
}
