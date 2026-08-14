import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260815004500_m14_3_1_native_massage_availability_window.sql", import.meta.url),
  "utf8",
);
const helper = readFileSync(
  new URL("../../lib/server/massage-native-runtime.ts", import.meta.url),
  "utf8",
);
const guestRoute = readFileSync(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);
const staffRequest = readFileSync(
  new URL("../../lib/server/massage-staff-request.ts", import.meta.url),
  "utf8",
);

test("M14.3.1 availability window RPC is tenant scoped, bounded and service-role only", () => {
  assert.match(migration, /get_massage_runtime_availability_window/);
  assert.match(migration, /p_hotel_id uuid/);
  assert.match(migration, /p_days_ahead integer/);
  assert.match(migration, /p_days_ahead < 1 or p_days_ahead > 60/);
  assert.match(migration, /s\.hotel_id = p_hotel_id/);
  assert.match(migration, /public\.get_massage_runtime_available_times\(\s*p_hotel_id/);
  assert.match(migration, /revoke all on function public\.get_massage_runtime_availability_window/);
  assert.match(migration, /grant execute on function public\.get_massage_runtime_availability_window[\s\S]*to service_role, postgres/);
  assert.doesNotMatch(migration, /aquamarin/i);
  assert.doesNotMatch(migration, /843ec551|05624aa0/i);
});

test("M14.3.1 native read helper preserves the legacy client result contract", () => {
  assert.match(helper, /getNativeMassageServices/);
  assert.match(helper, /getNativeMassageAvailability/);
  assert.match(helper, /getNativeMassageBookableDates/);
  assert.match(helper, /getNativeMassageBookableDateSummary/);
  assert.match(helper, /getNativeMassageBootstrap/);
  assert.match(helper, /get_massage_runtime_availability_window/);
  assert.match(helper, /readMode: "M14_3_NATIVE_SUPABASE"/);
  assert.match(helper, /formatNativeMassageClientTime/);
  assert.match(helper, /return `\$\{Number\(canonical\.slice\(0, 2\)\)\}:\$\{canonical\.slice\(3, 5\)\}`/);
});

test("M14.3.1 sandbox GET actions use native Supabase before Production snapshot logic", () => {
  const sandboxIndex = guestRoute.indexOf("if (isSandboxHotel(hotel))");
  const snapshotIndex = guestRoute.indexOf("const snapshotReadsEnabled = isMassageSnapshotEnabled(hotel.slug)");
  assert.ok(sandboxIndex >= 0, "sandbox authority branch must exist");
  assert.ok(snapshotIndex > sandboxIndex, "Production snapshot path must remain after sandbox native branch");

  for (const call of [
    "getNativeMassageServices",
    "getNativeMassageBootstrap",
    "getNativeMassageBookableDates",
    "getNativeMassageBookableDateSummary",
    "getNativeMassageAvailability",
  ]) {
    assert.match(guestRoute, new RegExp(call));
  }
  assert.match(guestRoute, /authority: "native_supabase"/);
  assert.match(guestRoute, /readMassageSnapshotAction/);
  assert.match(guestRoute, /getMassageAvailability/);
});

test("M14.3.1 sandbox POST creates a real native booking and never writes the Google Sheet", () => {
  assert.match(guestRoute, /createSandboxNativeMassageBooking/);
  assert.match(guestRoute, /action: "sandbox_native_book"/);
  assert.match(guestRoute, /nativeBookingId: nativeBooking\.bookingId/);
  assert.match(guestRoute, /authorityMode: "native_supabase"/);
  assert.match(guestRoute, /sheetWrite: false/);
  assert.match(guestRoute, /writeVerified: true/);
  assert.doesNotMatch(guestRoute, /sandbox_simulated_book/);
  assert.doesNotMatch(guestRoute, /sandboxSimulation: true/);
});

test("M14.3.1 sandbox POST uses deterministic retry idempotency and maps conflicts to 409", () => {
  assert.match(guestRoute, /buildSandboxNativeIdempotencyKey/);
  assert.match(guestRoute, /input\.stayId/);
  assert.match(guestRoute, /input\.stayDeviceId/);
  assert.match(guestRoute, /input\.serviceId/);
  assert.match(guestRoute, /MASSAGE_SLOT_UNAVAILABLE/);
  assert.match(guestRoute, /statusCode: 409/);
  assert.match(guestRoute, /BOOKING_ALREADY_CONFIRMED/);
  assert.match(guestRoute, /nativeBooking\.idempotentReplay \? 200 : 201/);
});

test("M14.3.1 Production massage write path remains the incumbent tracked adapter", () => {
  assert.match(guestRoute, /createReliabilityAwareMassageBooking/);
  assert.match(guestRoute, /executeTrackedMassageBooking/);
  assert.match(guestRoute, /attachTrackedMassageStaffRequest/);
  assert.match(guestRoute, /sheetWrite: true/);
  assert.match(guestRoute, /authorityMode: "legacy_sheet"/);
  assert.doesNotMatch(guestRoute, /createProductionNativeMassageBooking/);
});

test("M14.3.1 staff request links native booking authority without enabling sandbox push", () => {
  assert.match(staffRequest, /authorityMode\?: "legacy_sheet" \| "native_supabase"/);
  assert.match(staffRequest, /nativeBookingId\?: string \| null/);
  assert.match(staffRequest, /nativeBookingId,/);
  assert.match(staffRequest, /source: authorityMode === "native_supabase" \? "stayhub_native_supabase" : "stayhub"/);
  assert.match(staffRequest, /shouldSuppressLivePush/);
  assert.match(staffRequest, /if \(!suppressLivePush\)/);
  assert.match(staffRequest, /Google Sheet не е променян/);
});

test("M14.3.1 guest history remains backed by tenant/stay/device-scoped guest request rows", () => {
  assert.match(guestRoute, /\.from\("guest_requests"\)/);
  assert.match(guestRoute, /\.eq\("hotel_id", input\.hotelId\)/);
  assert.match(guestRoute, /\.eq\("room_number_snapshot", input\.room\)/);
  assert.match(guestRoute, /isMassageBookingVisibleForStay/);
  assert.match(staffRequest, /stay_id: stayId/);
  assert.match(staffRequest, /stay_device_id: stayDeviceId/);
});
