import { getHotelIdBySlug } from "@/lib/hotels/getHotelIdBySlug";
import { supabase } from "@/lib/supabase";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import type {
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

export type HotelScopeInput = {
  hotelId?: string;
  hotelSlug?: string;
};

type CreateSupabaseRequestInput = HotelScopeInput & {
  room: string;
  type: StaffRequestType;
  typeLabel: string;
  serviceTime: StaffServiceTime;
  note?: string;
};

type GuestRequestRow = {
  id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string;
  message: string | null;
  status: StaffRequestStatus;
  created_at: string;
  metadata_json: {
    department?: StaffRequest["department"];
    serviceTime?: StaffServiceTime;
    typeLabel?: string;
    note?: string;
  } | null;
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

function mapRowToStaffRequest(row: GuestRequestRow): StaffRequest {
  const metadata = row.metadata_json ?? {};
  const created = new Date(row.created_at);

  return {
    id: row.id,
    room: row.room_number_snapshot ?? "Unknown",
    department: metadata.department ?? "reception",
    type: row.request_type as StaffRequestType,
    typeLabel: metadata.typeLabel ?? row.title,
    status: row.status,
    serviceTime: metadata.serviceTime ?? "now",
    createdAt: created.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtIso: row.created_at,
    createdDateKey: created.toLocaleDateString("sv-SE"),
    note: metadata.note ?? row.message ?? undefined,
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
  const department = getDepartmentForRequestType(input.type);
  const { hotelId } = await resolveHotelScope(input);

  const { data, error } = await supabase
    .from("guest_requests")
    .insert({
      hotel_id: hotelId,
      room_number_snapshot: input.room,
      source: "guest_hub",
      channel: "pwa",
      guest_language: "en",
      request_type: input.type,
      category: getCategoryForRequestType(input.type),
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

  return mapRowToStaffRequest(data as GuestRequestRow);
}

export async function fetchSupabaseRequests(scope?: HotelScopeInput): Promise<StaffRequest[]> {
  const { hotelId } = await resolveHotelScope(scope);

  const { data, error } = await supabase
    .from("guest_requests")
    .select(
      "id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json"
    )
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchSupabaseRequests failed", { error, hotelId, scope });
    throw new Error(`Failed to fetch requests: ${error.message}`);
  }

  return (data as GuestRequestRow[]).map(mapRowToStaffRequest);
}

export async function updateSupabaseRequestStatus(
  id: string,
  status: StaffRequestStatus,
  scope?: HotelScopeInput
): Promise<void> {
  const { hotelId } = await resolveHotelScope(scope);
  const payload: Record<string, string> = { status };

  if (status === "in_progress") {
    payload.started_at = new Date().toISOString();
  }

  if (status === "completed") {
    payload.resolved_at = new Date().toISOString();
    payload.closed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("guest_requests")
    .update(payload)
    .eq("id", id)
    .eq("hotel_id", hotelId);

  if (error) {
    console.error("updateSupabaseRequestStatus failed", {
      id,
      status,
      hotelId,
      error,
    });
    throw new Error(`Failed to update request status: ${error.message}`);
  }
}
