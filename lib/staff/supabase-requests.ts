import { getHotelIdBySlug } from "@/lib/hotels/getHotelIdBySlug";
import { supabase } from "@/lib/supabase";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

export type HotelScopeInput = {
  hotelId?: string;
  hotelSlug?: string;
  role?: "reception" | "housekeeping" | "maintenance" | "manager";
};

type CreateSupabaseRequestInput = HotelScopeInput & {
  room: string;
  type: StaffRequestType;
  typeLabel: string;
  serviceTime: StaffServiceTime;
  note?: string;
  departmentOverride?: StaffDepartment;
};

type FetchRequestsApiResponse = {
  ok: boolean;
  requests?: StaffRequest[];
  error?: string;
};

type StaffActionApiResponse = {
  ok: boolean;
  error?: string;
};

async function resolveHotelScope(input?: HotelScopeInput): Promise<{ hotelId: string; hotelSlug?: string }> {
  if (input?.hotelId) {
    return {
      hotelId: String(input.hotelId).trim(),
      hotelSlug: input.hotelSlug ? String(input.hotelSlug).trim().toLowerCase() : undefined,
    };
  }

  const normalizedSlug = String(input?.hotelSlug ?? "").trim().toLowerCase();
  const hotelId = await getHotelIdBySlug(normalizedSlug || undefined);

  return {
    hotelId,
    hotelSlug: normalizedSlug || undefined,
  };
}

function getCategoryForRequestType(type: StaffRequestType) {
  if (type === "restaurant_reservation") return "reservation";
  if (type === "information") return "info";
  return "service";
}

export async function createSupabaseRequest(
  input: CreateSupabaseRequestInput
): Promise<StaffRequest> {
  const normalizedType = normalizeStaffRequestType(String(input.type), input.departmentOverride);
  const department = input.departmentOverride ?? getDepartmentForRequestType(normalizedType);
  const { hotelId } = await resolveHotelScope(input);

  const { data, error } = await supabase
    .from("guest_requests")
    .insert({
      hotel_id: hotelId,
      room_number_snapshot: input.room,
      source: "guest_hub",
      channel: "pwa",
      guest_language: "en",
      request_type: normalizedType,
      category: getCategoryForRequestType(normalizedType),
      priority: "normal",
      title: input.typeLabel,
      message: input.note ?? null,
      status: "new",
      metadata_json: {
        department,
        serviceTime: input.serviceTime,
        typeLabel: input.typeLabel,
        note: input.note ?? null,
      },
    })
    .select(
      "id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json"
    )
    .single();

  if (error) {
    console.error("createSupabaseRequest failed", {
      input,
      hotelId,
      error,
    });
    throw new Error(`Failed to create request: ${error.message}`);
  }

  const created = new Date(data.created_at);

  return {
    id: data.id,
    room: data.room_number_snapshot ?? "Unknown",
    department: data.metadata_json?.department ?? "reception",
    type: normalizeStaffRequestType(data.request_type, data.metadata_json?.department),
    typeLabel: data.metadata_json?.typeLabel ?? data.title,
    status: data.status as StaffRequestStatus,
    serviceTime: data.metadata_json?.serviceTime ?? "now",
    createdAt: created.toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtIso: data.created_at,
    createdDateKey: created.toLocaleDateString("sv-SE"),
    note: data.metadata_json?.note ?? data.message ?? undefined,
  };
}

export async function fetchSupabaseRequests(scope?: HotelScopeInput): Promise<StaffRequest[]> {
  const hotelSlug = String(scope?.hotelSlug ?? "").trim().toLowerCase();
  const role = scope?.role;

  if (!hotelSlug || !role) {
    throw new Error("fetchSupabaseRequests requires hotelSlug and role");
  }

  const res = await fetch(
    `/api/staff/requests?hotelSlug=${encodeURIComponent(hotelSlug)}&role=${encodeURIComponent(role)}`,
    {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    }
  );

  const data = (await res.json().catch(() => null)) as FetchRequestsApiResponse | null;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to fetch staff requests");
  }

  return data.requests ?? [];
}

export async function updateSupabaseRequestStatus(
  id: string,
  status: StaffRequestStatus,
  scope?: HotelScopeInput
): Promise<void> {
  const hotelSlug = String(scope?.hotelSlug ?? "").trim().toLowerCase();
  const role = scope?.role;

  if (!hotelSlug || !role) {
    throw new Error("updateSupabaseRequestStatus requires hotelSlug and role");
  }

  const res = await fetch("/api/staff/request-status", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      hotelSlug,
      role,
      requestId: id,
      status,
    }),
  });

  const data = (await res.json().catch(() => null)) as StaffActionApiResponse | null;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to update staff request status");
  }
}