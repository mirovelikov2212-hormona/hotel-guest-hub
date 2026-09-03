import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const shell = read("components/staff/StaffHotelShell.tsx");
const theme = read("app/staff/staff-theme.css");
const brand = read("lib/server/staff-hotel-brand.ts");
const access = read("lib/server/guest-communications-access.ts");
const api = read("app/api/staff/guest-communications/route.ts");
const translation = read("lib/server/guest-communications-translation.ts");
const delivery = read("lib/server/guest-communications-delivery.ts");
const cron = read("app/api/cron/guest-communications-dispatch/route.ts");
const guestApi = read("app/api/guest/communications/route.ts");
const inbox = read("components/GuestCommunicationsInbox.tsx");
const directWorkspace = read("components/staff/GuestDirectCommunicationsWorkspace.tsx");
const guestPage = read("app/h/[hotelSlug]/page.tsx");
const migration = read("supabase/migrations/20260829233000_guest_communications_rbac_foundation.sql");

function contains(source, fragment) {
  assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
}

function excludes(source, fragment) {
  assert.ok(!source.includes(fragment), `Expected source not to contain: ${fragment}`);
}

test("Staff Hub uses hotel-scoped branding with persistent Light/Dark modes", () => {
  contains(brand, '.from("hotel_branding_configs")');
  contains(brand, '.eq("hotel_id", input.hotelId)');
  contains(brand, 'source: "published_hotel_config"');
  contains(shell, 'stayhub:staff-theme:v1:${hotelSlug}');
  contains(shell, 'data-staff-theme={theme}');
  contains(shell, 'selectTheme("light")');
  contains(shell, 'selectTheme("dark")');
  contains(shell, 'GuestCommunicationsWorkspace');
  contains(theme, '--staff-brand-primary');
  contains(theme, '.stayhub-staff-shell[data-staff-theme="light"]');
  contains(theme, '.stayhub-staff-shell[data-staff-theme="dark"]');
});

test("department roles default to own communications while manager has hotel oversight", () => {
  contains(access, '"guest_communications.view_own"');
  contains(access, '"guest_communications.view_all"');
  contains(access, '"guest_communications.create"');
  contains(access, '"guest_communications.send"');
  contains(access, '"guest_communications.schedule"');
  contains(access, '"guest_communications.emergency_send"');
  contains(access, '.eq("hotel_id", hotel.id)');
  contains(access, '.eq("role_code", role)');
  contains(api, 'messagesQuery = messagesQuery.eq("department_id", access.runtimeRole.departmentId)');
  contains(api, 'return json({ ok: false, error: "emergency_forbidden" }, 403)');
});

test("Send and Schedule fail closed until all six guest languages are ready", () => {
  for (const language of ["bg", "en", "de", "ro", "cs", "ru"]) {
    contains(translation, `"${language}"`);
  }
  contains(api, 'if (action !== "draft")');
  contains(api, 'translateGuestCommunication');
  contains(api, 'return json({ ok: false, error: "translation_unavailable" }, 503)');
  contains(api, 'translationStatus = "ready"');
  contains(migration, 'translation_status text not null default \'pending\'');
});

test("delivery is kill-switched, active-stay scoped and idempotent", () => {
  contains(delivery, 'process.env.GUEST_COMMUNICATIONS_DELIVERY_ENABLED');
  contains(delivery, '.eq("status", "active")');
  contains(delivery, '.eq("lifecycle_state", "active")');
  contains(delivery, '.eq("hotel_id", hotelId)');
  contains(delivery, 'onConflict: "communication_id,subscription_id"');
  contains(delivery, 'ignoreDuplicates: true');
  contains(delivery, 'const failureCount = input.failed + input.expired + input.skipped');
  contains(delivery, '? "partial_failed"');
  contains(cron, 'if (!guestCommunicationsDeliveryEnabled())');
  contains(cron, 'enabled: false');
  contains(migration, 'unique (communication_id, subscription_id)');
});

test("Guest Message Center uses exact stay identity and hotel-scoped localized feed", () => {
  contains(guestApi, 'getGuestStayStatus');
  contains(guestApi, 'getGuestStayAccessState');
  contains(guestApi, 'if (!access.canWrite)');
  contains(guestApi, '.eq("hotel_id", stayResult.hotel.id)');
  contains(guestApi, '.eq("translation_status", "ready")');
  contains(inbox, 'guesthub_room_state:${String(hotelSlug');
  contains(inbox, 'stayId: identity.stayId');
  contains(inbox, 'stayDeviceId: identity.stayDeviceId');
  contains(inbox, 'deviceToken: identity.deviceToken');
  contains(guestPage, '<GuestCommunicationsInbox');
});

test("Reception direct conversations expose persistent unread guest-reply indicators", () => {
  contains(directWorkspace, 'stayhub:staff-direct-seen:v1:');
  contains(directWorkspace, 'message.senderType === "guest" && !seenGuestMessageIds.has(message.id)');
  contains(directWorkspace, 'unreadByStay');
  contains(directWorkspace, 'copy.newReplies');
  contains(directWorkspace, 'copy.new');
  contains(directWorkspace, 'markGuestMessageRead(message.id)');
  contains(directWorkspace, 'writeSeenGuestMessages(hotelSlug, role, next)');
});

test("communications runtime never invokes Factory publication or LIVE activation", () => {
  const combined = [shell, access, api, translation, delivery, cron, guestApi, inbox, directWorkspace].join("\n");
  excludes(combined, "/api/control-plane/onboarding/live");
  excludes(combined, "/api/control-plane/onboarding/publication");
  excludes(combined, "activate_factory_production_live");
  excludes(combined, "activateLive: true");
});
