import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  assertBefore,
  assertContains,
  countOccurrences,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("guest request creation validates the confirmed stay before inserting", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, "validateGuestStayIdentity({");
  assertContains(source, 'code: "STAY_REQUIRED"');
  assertBefore(
    source,
    "validateGuestStayIdentity({",
    '.from("guest_requests")',
    "Stay/device validation must happen before the guest request insert.",
  );
});

test("staff request status reads and writes remain scoped to the session hotel", async () => {
  const source = await readProjectFile("app/api/staff/request-status/route.ts");
  const hotelScopeChecks = countOccurrences(source, '.eq("hotel_id", scope.hotelId)');

  assert.ok(
    hotelScopeChecks >= 2,
    "Expected both the request lookup and request update to be scoped by hotel_id.",
  );
  assertBefore(
    source,
    "const scope = await resolveAuthorizedScope(hotelSlug, role);",
    '.from("guest_requests")',
  );
});

test("staff billing updates remain scoped to the authenticated hotel", async () => {
  const source = await readProjectFile("app/api/staff/request-billing/route.ts");

  assertContains(source, "getCurrentStaffSession");
  assertContains(source, '.eq("hotel_id", scope.hotelId)');
});

test("production debug config remains disabled", async () => {
  const source = await readProjectFile("app/api/debug-config/route.ts");

  assertContains(source, 'process.env.NODE_ENV === "production"');
  assertContains(source, 'error: "Not found"');
  assertContains(source, 'status: 404');
});

test("massage POST requires validated stayId and stayDeviceId before a booking write", async () => {
  const routeSource = await readProjectFile("app/api/guest/massages/route.ts");
  const componentSource = await readProjectFile("components/MassageBookingSection.tsx");
  const postSource = routeSource.slice(routeSource.indexOf("export async function POST"));

  assertContains(postSource, "const stayIdentity = await requireMassageGuestStayIdentity({");
  assertContains(postSource, "stayId: body.stayId");
  assertContains(postSource, "stayDeviceId: body.stayDeviceId");
  assertBefore(
    postSource,
    "const stayIdentity = await requireMassageGuestStayIdentity({",
    "if (isSandboxHotel(hotel))",
    "Stay/device validation must happen before sandbox, controlled E2E, or production booking writes.",
  );
  assertContains(componentSource, "stayId,");
  assertContains(componentSource, "stayDeviceId,");
});

test("massage active_bookings requires validated stay/device identity", async () => {
  const routeSource = await readProjectFile("app/api/guest/massages/route.ts");
  const guestHubSource = await readProjectFile("components/GuestHub.tsx");
  const getStart = routeSource.indexOf("export async function GET");
  const postStart = routeSource.indexOf("export async function POST");
  const getSource = routeSource.slice(getStart, postStart);

  assertContains(getSource, 'if (action === "active_bookings")');
  assertContains(getSource, 'stayId: params.get("stayId")');
  assertContains(getSource, 'stayDeviceId: params.get("stayDeviceId")');
  assertBefore(
    getSource,
    "const stayIdentity = await requireMassageGuestStayIdentity({",
    "const bookings = await getActiveGuestMassageBookings({",
    "Active massage bookings must not be loaded before stay/device validation.",
  );
  assertContains(guestHubSource, "stayId: activeStayId");
  assertContains(guestHubSource, "stayDeviceId,");
});


test("public tracking ignores client hotelId and requires canonical server resolution", async () => {
  const source = await readProjectFile("app/api/track/route.ts");

  assertContains(source, 'from "@/lib/hotels/hotel-slug.mjs"');
  assertContains(source, "resolveHotelByAnySlugAdmin");
  assertContains(source, "const scopeResolution = await resolveTrackingHotelScope({");
  assertContains(source, 'code: scopeResolution.code');
  assertContains(source, "const resolvedHotelId = hotelScope.id;");
  assertBefore(
    source,
    "const scopeResolution = await resolveTrackingHotelScope({",
    'const legacyPayload = {',
    "Canonical hotel resolution must complete before a tracking payload can be built.",
  );

  assert.equal(
    source.includes("body.hotelId"),
    false,
    "The public tracking route must never trust or fall back to a client-supplied hotelId.",
  );
});

test("tracking uses the shared hotel alias contract and one canonical identity for both inserts", async () => {
  const source = await readProjectFile("app/api/track/route.ts");

  assertContains(source, "sanitizeHotelSlug");
  assertContains(source, "const hotelScope = scopeResolution.scope;");
  assertContains(source, "hotel_id: resolvedHotelId");
  assertContains(source, "const enrichedPayload = {");
  assertContains(source, "...legacyPayload,");
  assert.ok(
    countOccurrences(source, 'supabaseAdmin') >= 3,
    "Tracking reads and writes must use the shared server-side Supabase admin client.",
  );
  assert.equal(
    source.includes('if (slug === "aquamarine")'),
    false,
    "Tracking must not maintain a private Aquamarine alias branch.",
  );
  assert.equal(
    source.includes('createClient('),
    false,
    "Tracking must not create a separate service-role client outside the shared server client.",
  );
});


test("same-day room turnover hides the previous guest massage from the new device", async () => {
  const moduleUrl = pathToFileURL(resolve("lib/server/massage-booking-visibility.mjs"));
  moduleUrl.searchParams.set("testRun", String(Date.now()));
  const { isMassageBookingVisibleForStay } = await import(moduleUrl.href);

  const currentStay = {
    currentStayId: "stay-guest-2",
    currentStayDeviceId: "device-guest-2-new-phone",
    currentStayCheckInAt: "2026-08-03T12:00:00.000Z",
    currentStayEffectiveCheckOutAt: "2026-08-08T09:00:00.000Z",
  };

  assert.equal(
    isMassageBookingVisibleForStay({
      ...currentStay,
      rowStayId: "stay-guest-1",
      rowStayDeviceId: "device-guest-1-old-phone",
      bookingCreatedAt: "2026-08-03T08:00:00.000Z",
    }),
    false,
    "A booking linked to the previous stay/device must never be visible to the next guest in the same room.",
  );

  assert.equal(
    isMassageBookingVisibleForStay({
      ...currentStay,
      rowStayId: null,
      rowStayDeviceId: null,
      bookingCreatedAt: "2026-08-03T11:59:00.000Z",
    }),
    false,
    "A legacy booking created before the new guest check-in must stay hidden, even on the same calendar day.",
  );

  assert.equal(
    isMassageBookingVisibleForStay({
      ...currentStay,
      rowStayId: "stay-guest-2",
      rowStayDeviceId: "device-guest-2-new-phone",
      bookingCreatedAt: "2026-08-03T12:05:00.000Z",
    }),
    true,
    "The new guest must see a booking linked to the new stay and new device.",
  );

  assert.equal(
    isMassageBookingVisibleForStay({
      ...currentStay,
      rowStayId: null,
      rowStayDeviceId: null,
      bookingCreatedAt: "2026-08-03T12:05:00.000Z",
    }),
    true,
    "A legacy booking created inside the validated current stay remains backward compatible.",
  );
});
