import "server-only";

import {
  deriveGuestStayLifecycle,
  getGuestStayAccessPolicy,
  type GuestStayLifecycleState,
} from "@/lib/guest-stays/lifecycle-model.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export class GuestStayAccessError extends Error {
  code: string;
  statusCode: number;
  state: GuestStayLifecycleState | null;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    state: GuestStayLifecycleState | null = null,
  ) {
    super(message);
    this.name = "GuestStayAccessError";
    this.code = code;
    this.statusCode = statusCode;
    this.state = state;
  }
}

type StayAccessRow = {
  id: string;
  hotel_id: string;
  room_number: string;
  scheduled_check_out_at: string;
  effective_check_out_at: string;
  late_checkout_status: string | null;
  status: string | null;
  lifecycle_state: GuestStayLifecycleState | null;
  lifecycle_updated_at: string | null;
  read_only_at: string | null;
};

type StayDeviceAccessRow = {
  id: string;
  stay_id: string;
  hotel_id: string;
  room_number: string;
};

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function lifecycleError(state: GuestStayLifecycleState) {
  if (state === "checkout_pending") {
    return new GuestStayAccessError(
      "STAY_CHECKOUT_PENDING",
      "Checkout is pending. This stay is read-only until Reception completes the checkout decision.",
      409,
      state,
    );
  }

  if (state === "read_only") {
    return new GuestStayAccessError(
      "STAY_READ_ONLY",
      "This stay has ended and is now read-only.",
      409,
      state,
    );
  }

  return new GuestStayAccessError(
    "STAY_ENDED",
    "This stay has ended.",
    409,
    state,
  );
}

async function persistLifecycleState(input: {
  hotelId: string;
  stay: StayAccessRow;
  state: GuestStayLifecycleState;
  nowIso: string;
}) {
  const desiredLegacyStatus = input.state === "active" || input.state === "checkout_pending"
    ? "active"
    : input.stay.status === "cancelled"
      ? "cancelled"
      : "ended";
  const readOnlyAt = input.state === "read_only"
    ? input.stay.read_only_at || input.stay.effective_check_out_at || input.nowIso
    : null;

  const lifecycleChanged =
    input.stay.lifecycle_state !== input.state ||
    input.stay.status !== desiredLegacyStatus ||
    input.stay.read_only_at !== readOnlyAt;

  if (!lifecycleChanged) return;

  const { error } = await supabaseAdmin
    .from("guest_stays")
    .update({
      lifecycle_state: input.state,
      lifecycle_updated_at: input.nowIso,
      read_only_at: readOnlyAt,
      status: desiredLegacyStatus,
      updated_at: input.nowIso,
    })
    .eq("id", input.stay.id)
    .eq("hotel_id", input.hotelId);

  if (error) throw error;
}

export async function getGuestStayAccessState(input: {
  hotelId: string;
  room: string;
  stayId: unknown;
  stayDeviceId: unknown;
  now?: Date;
}) {
  const hotelId = String(input.hotelId || "").trim();
  const room = normalizeRoomNumber(input.room);
  const stayId = String(input.stayId || "").trim();
  const stayDeviceId = String(input.stayDeviceId || "").trim();

  if (!hotelId || !room || !stayId || !stayDeviceId) {
    throw new GuestStayAccessError(
      "STAY_REQUIRED",
      "A confirmed stay is required.",
      401,
    );
  }

  const { data: stay, error: stayError } = await supabaseAdmin
    .from("guest_stays")
    .select("id, hotel_id, room_number, scheduled_check_out_at, effective_check_out_at, late_checkout_status, status, lifecycle_state, lifecycle_updated_at, read_only_at")
    .eq("id", stayId)
    .eq("hotel_id", hotelId)
    .eq("room_number", room)
    .maybeSingle();

  if (stayError) throw stayError;
  if (!stay) {
    throw new GuestStayAccessError(
      "STAY_REQUIRED",
      "A confirmed stay is required.",
      401,
    );
  }

  const { data: device, error: deviceError } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id, stay_id, hotel_id, room_number")
    .eq("id", stayDeviceId)
    .eq("stay_id", stayId)
    .eq("hotel_id", hotelId)
    .eq("room_number", room)
    .maybeSingle();

  if (deviceError) throw deviceError;
  if (!device) {
    throw new GuestStayAccessError(
      "STAY_REQUIRED",
      "A confirmed stay is required.",
      401,
    );
  }

  const now = input.now || new Date();
  const state = deriveGuestStayLifecycle({
    status: stay.status,
    lateCheckoutStatus: stay.late_checkout_status,
    scheduledCheckOutAt: stay.scheduled_check_out_at,
    effectiveCheckOutAt: stay.effective_check_out_at,
    nowMs: now.getTime(),
  });
  const policy = getGuestStayAccessPolicy(state);
  const nowIso = now.toISOString();

  await persistLifecycleState({
    hotelId,
    stay: stay as StayAccessRow,
    state,
    nowIso,
  });

  return {
    ...policy,
    stay: stay as StayAccessRow,
    device: device as StayDeviceAccessRow,
  };
}

export async function requireGuestStayWriteAccess(input: {
  hotelId: string;
  room: string;
  stayId: unknown;
  stayDeviceId: unknown;
  now?: Date;
}) {
  const access = await getGuestStayAccessState(input);
  if (!access.canWrite) throw lifecycleError(access.state);
  return access;
}

export async function requireGuestStayReadAccess(input: {
  hotelId: string;
  room: string;
  stayId: unknown;
  stayDeviceId: unknown;
  now?: Date;
}) {
  const access = await getGuestStayAccessState(input);
  if (!access.canRead) throw lifecycleError(access.state);
  return access;
}
