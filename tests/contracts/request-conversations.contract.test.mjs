import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("request conversations extend guest communications without creating a second messaging authority", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260902171500_guest_request_conversations_core.sql",
  );
  const service = await readProjectFile(
    "lib/server/guest-request-conversations.ts",
  );

  assertContains(migration, "audience_type in ('all_active_guests', 'request_thread')");
  assertContains(migration, "append_guest_request_communication_v1");
  assertContains(migration, "GUEST_REQUEST_CONVERSATION_SCOPE_MISMATCH");
  assertContains(migration, "GUEST_REQUEST_CONVERSATION_DEVICE_MISMATCH");
  assertContains(migration, "GUEST_REQUEST_CONVERSATION_STAFF_SESSION_INVALID");
  assertContains(migration, "conversation_state in ('none', 'waiting_for_guest', 'waiting_for_staff')");
  assertContains(migration, "grant execute on function public.append_guest_request_communication_v1");
  assertContains(migration, "to service_role");
  assertContains(service, 'const THREAD_AUDIENCE = "request_thread"');
  assertContains(service, '.rpc("append_guest_request_communication_v1"');
  assertNotContains(service, "aquamarin");
  assertNotContains(service, "aquamarine");
});

test("broadcast paths fail closed and can never consume request-thread messages", async () => {
  const guestBroadcast = await readProjectFile(
    "app/api/guest/communications/route.ts",
  );
  const staffBroadcast = await readProjectFile(
    "app/api/staff/guest-communications/route.ts",
  );
  const delivery = await readProjectFile(
    "lib/server/guest-communications-delivery.ts",
  );

  assertContains(guestBroadcast, '.eq("audience_type", "all_active_guests")');
  assertContains(staffBroadcast, '.eq("audience_type", "all_active_guests")');
  assertContains(delivery, '.eq("audience_type", "all_active_guests")');
  assertContains(delivery, 'reason: "audience_not_broadcast"');
  assertNotContains(guestBroadcast, 'audience_type", "request_thread"');
});

test("staff request conversations use same-origin auth, capability scope and targeted delivery identity", async () => {
  const staffRoute = await readProjectFile(
    "app/api/staff/request-conversations/route.ts",
  );
  const access = await readProjectFile(
    "lib/server/guest-communications-access.ts",
  );
  const service = await readProjectFile(
    "lib/server/guest-request-conversations.ts",
  );

  assertContains(staffRoute, "enforceStaffSameOrigin(req)");
  assertContains(staffRoute, "staffCanViewRequestConversation");
  assertContains(staffRoute, "staffCanReplyToRequestConversation");
  assertContains(access, '"guest_request_conversations.view_all"');
  assertContains(access, '"guest_request_conversations.view_own"');
  assertContains(access, '"guest_request_conversations.reply"');
  assertContains(service, '.eq("hotel_id", input.hotel.id)');
  assertContains(service, '.eq("stay_id", input.request.stay_id)');
  assertContains(service, '.eq("stay_device_id", input.request.stay_device_id)');
  assertContains(service, 'reason: "sandbox_delivery_disabled"');
});

test("guest request conversations require the exact stay and device identity", async () => {
  const guestRoute = await readProjectFile(
    "app/api/guest/request-conversations/route.ts",
  );

  assertContains(guestRoute, "getGuestStayStatus");
  assertContains(guestRoute, "getGuestStayAccessState");
  assertContains(guestRoute, "request.stay_id !== stayResult.stay.id");
  assertContains(guestRoute, "request.stay_device_id !== stayResult.stay.stayDeviceId");
  assertContains(guestRoute, '.eq("stay_id", stayResult.stay.id)');
  assertContains(guestRoute, '.eq("stay_device_id", stayResult.stay.stayDeviceId)');
  assertContains(guestRoute, "if (!access.canWrite)");
});

test("staff-to-guest replies are six-language fail-closed while guest replies are never lost on translation outage", async () => {
  const service = await readProjectFile(
    "lib/server/guest-request-conversations.ts",
  );

  assertContains(service, "translateGuestCommunication({");
  assertContains(service, "STAFF_THREAD_TITLE");
  assertContains(service, "GUEST_REPLY_TITLE");
  assertContains(service, 'translationStatus = "ready"');
  assertContains(service, 'translationStatus: "ready"');
  assertContains(service, "Never lose a guest reply solely because the translation provider is down");
  assertContains(service, 'translationStatus: "partial"');
}
);