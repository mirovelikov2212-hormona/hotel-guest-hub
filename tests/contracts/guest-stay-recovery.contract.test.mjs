import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  assertBefore,
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("only confirmed stale guest stay identity errors trigger local recovery", async () => {
  const moduleUrl = pathToFileURL(resolve("lib/guest-stays/stale-state-recovery.mjs"));
  moduleUrl.searchParams.set("testRun", String(Date.now()));
  const { isRecoverableGuestStayErrorCode } = await import(moduleUrl.href);

  assert.equal(isRecoverableGuestStayErrorCode("STAY_NOT_FOUND"), true);
  assert.equal(isRecoverableGuestStayErrorCode("stay_device_not_found"), true);
  assert.equal(isRecoverableGuestStayErrorCode("MISSING_STAY_IDENTITY"), true);

  assert.equal(isRecoverableGuestStayErrorCode("MASSAGE_API_TIMEOUT"), false);
  assert.equal(isRecoverableGuestStayErrorCode("NETWORK_ERROR"), false);
  assert.equal(isRecoverableGuestStayErrorCode("INTERNAL_SERVER_ERROR"), false);
  assert.equal(isRecoverableGuestStayErrorCode(""), false);
});

test("safe room turnover releases only a stale previous stay after hotel check-in time", async () => {
  const moduleUrl = pathToFileURL(resolve("lib/guest-stays/room-turnover.mjs"));
  moduleUrl.searchParams.set("testRun", String(Date.now()));
  const { shouldAutoReleaseRoomTurnover } = await import(moduleUrl.href);

  const base = {
    requestedCheckInDate: "2026-08-15",
    hotelTodayDate: "2026-08-15",
    hotelNowMinutes: 16 * 60,
    standardCheckInMinutes: 15 * 60,
    overlappingStayCheckInDate: "2026-08-10",
    overlappingLastSeenLocalDate: "2026-08-14",
  };

  assert.equal(shouldAutoReleaseRoomTurnover(base), true);
  assert.equal(shouldAutoReleaseRoomTurnover({ ...base, hotelNowMinutes: 14 * 60 + 59 }), false);
  assert.equal(shouldAutoReleaseRoomTurnover({ ...base, requestedCheckInDate: "2026-08-14" }), false);
  assert.equal(shouldAutoReleaseRoomTurnover({ ...base, overlappingStayCheckInDate: "2026-08-15" }), false);
  assert.equal(shouldAutoReleaseRoomTurnover({ ...base, overlappingLastSeenLocalDate: "2026-08-15" }), false);
});

test("guest stay date normalization rejects impossible calendar dates", async () => {
  const moduleUrl = pathToFileURL(resolve("lib/guest-stays/date-key.mjs"));
  moduleUrl.searchParams.set("testRun", String(Date.now()));
  const { normalizeStayDateKey } = await import(moduleUrl.href);

  assert.equal(normalizeStayDateKey("2026-09-02"), "2026-09-02");
  assert.equal(normalizeStayDateKey("2028-02-29"), "2028-02-29");
  assert.equal(normalizeStayDateKey("2026-02-29"), "");
  assert.equal(normalizeStayDateKey("2026-02-31"), "");
  assert.equal(normalizeStayDateKey("2026-04-31"), "");
  assert.equal(normalizeStayDateKey("2026-13-01"), "");
  assert.equal(normalizeStayDateKey("02.09.2026"), "");
  assert.equal(normalizeStayDateKey("2026-9-2"), "");
});

test("database integrity permits only one active stay per room and preserves pending late checkout", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260818150000_guest_stay_single_active_integrity.sql",
  );

  assertContains(migration, "lock table public.guest_stays in share row exclusive mode");
  assertContains(migration, "status = 'ended'");
  assertContains(migration, "lifecycle_state = 'read_only'");
  assertContains(migration, "coalesce(late_checkout_status, 'none') <> 'pending'");
  assertContains(migration, "effective_check_out_at <= now()");
  assertContains(migration, "normalize_guest_stay_room_before_active_write_v1");
  assertContains(migration, "before insert or update of status, hotel_id, room_number");
  assertContains(migration, "where status = 'active';");
  assertContains(migration, "guest_stays_one_active_per_room_idx");
  assertContains(migration, "on public.guest_stays (hotel_id, room_number)");
});

test("database integrity rejects inactive rooms and revokes stays when a room is deactivated", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260902123500_harden_guest_stay_room_integrity.sql",
  );
  const privilegeMigration = await readProjectFile(
    "supabase/migrations/20260902124000_harden_guest_stay_room_integrity_privileges.sql",
  );

  assertContains(migration, "GUEST_STAY_ROOM_NOT_ACTIVE");
  assertContains(migration, "errcode = '23514'");
  assertContains(migration, "r.hotel_id = new.hotel_id");
  assertContains(migration, "r.room_number = new.room_number");
  assertContains(migration, "r.active = true");
  assertContains(migration, "rooms_end_active_guest_stays_on_deactivation_v1");
  assertContains(migration, "old.active = true and new.active = false");
  assertContains(migration, "lifecycle_state = 'read_only'");
  assertContains(privilegeMigration, "security invoker");
  assertContains(privilegeMigration, "revoke all on function public.end_guest_stays_for_deactivated_room_v1() from public");
  assertContains(privilegeMigration, "from anon");
  assertContains(privilegeMigration, "from authenticated");
});

test("guest request cards use the hotel timezone for both new and restored request timestamps", async () => {
  const createRoute = await readProjectFile("app/api/guest/request-create/route.ts");
  const historyRoute = await readProjectFile("app/api/guest/requests/route.ts");

  assertContains(createRoute, 'const hotelTimeZone = String(hotelConfig.hotelTimezone || "UTC")');
  assertContains(createRoute, "timeZone: hotelTimeZone");
  assertContains(historyRoute, '.select("id, slug, public_slug, name, active, timezone")');
  assertContains(historyRoute, 'const hotelTimeZone = String(hotel.timezone || "UTC")');
  assertContains(historyRoute, "timeZone: hotelTimeZone");
  assertContains(historyRoute, 'toLocaleDateString("sv-SE", {');
});

test("Guest Hub clears stale stay state, dependent local data and preserves the device token", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  const refreshStart = source.indexOf("const refreshStay = async () => {");
  const refreshEnd = source.indexOf("\n    void refreshStay();", refreshStart);

  assert.ok(refreshStart >= 0, "Expected Guest Hub to contain the stay refresh function.");
  assert.ok(refreshEnd > refreshStart, "Expected Guest Hub stay refresh function boundary.");

  const refreshSource = source.slice(refreshStart, refreshEnd);

  assertContains(source, "isRecoverableGuestStayErrorCode");
  assertContains(refreshSource, "payload?.error");
  assertContains(refreshSource, 'setActiveStayId("");');
  assertContains(refreshSource, 'setStayDeviceId("");');
  assertContains(refreshSource, 'setCheckInDate("");');
  assertContains(refreshSource, 'setCheckOutDate("");');
  assertContains(refreshSource, "writeStoredGuestRequestRefs(nextRequestRefs)");
  assertContains(refreshSource, "replaceStoredGuestMassageBookingsForRoom({");
  assertContains(refreshSource, "deviceToken: stayDeviceToken");
  assertContains(refreshSource, "writeStoredGuestRoomState(roomStateKey");
  assertContains(source, "stayExpiredNotifiedRef.current = false;");

  assertBefore(
    refreshSource,
    "if (!isRecoverableGuestStayErrorCode(errorCode)) return;",
    'setActiveStayId("");',
    "The client must classify the server error before clearing a guest stay.",
  );
});

test("configured test rooms silently recover stale identity without weakening real-room expiry alerts", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  const refreshStart = source.indexOf("const refreshStay = async () => {");
  const refreshEnd = source.indexOf("\n    void refreshStay();", refreshStart);
  const refreshSource = source.slice(refreshStart, refreshEnd);

  assert.match(source, /const testRoomSet = useMemo\([\s\S]*config\.testRoomNumbers/);
  assert.match(source, /const isDateExemptTestRoom = useCallback\([\s\S]*testRoomSet\.has\(normalizeRoomNumber\(candidate\)\)/);
  assertContains(refreshSource, "!isDateExemptTestRoom(staleRoom) && !stayExpiredNotifiedRef.current");
  assertContains(refreshSource, "const expiredRoom = normalizeRoomNumber(room || manualRoomInput || qrRoom);");
  assertContains(refreshSource, "!isDateExemptTestRoom(expiredRoom) && !stayExpiredNotifiedRef.current");
  assertContains(source, "roomStateHydrated,\n    isDateExemptTestRoom,\n    roomStateKey,");
  assert.doesNotMatch(source, /isDateExemptTestRoom\([^)]*["']103["']/);
});
