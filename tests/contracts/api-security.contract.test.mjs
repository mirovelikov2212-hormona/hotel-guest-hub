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
import { resolveGuestRequestAuthority } from "../../lib/server/guest-request-authority.mjs";

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

test("guest request room validation fails closed when hotel or room configuration is unavailable", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, 'code: "HOTEL_CONFIG_UNAVAILABLE"');
  assertContains(source, 'code: "ROOM_CONFIG_UNAVAILABLE"');
  assertContains(source, "if (!hotelConfig) {");
  assertContains(source, "if (validRoomNumbers.length === 0) {");
  assertContains(source, "if (!validRoomNumbers.includes(room)) {");

  assertBefore(
    source,
    "if (!hotelConfig) {",
    'const testRoomPolicy = await getTestRoomPolicy',
    "Hotel config must be validated before any request processing continues.",
  );

  assertBefore(
    source,
    "if (validRoomNumbers.length === 0) {",
    'const testRoomPolicy = await getTestRoomPolicy',
    "Room configuration must fail closed before stay validation or request insertion.",
  );

  assertBefore(
    source,
    'code: "ROOM_CONFIG_UNAVAILABLE"',
    '.from("guest_requests")',
    "An unavailable room configuration must block the request before Supabase insert.",
  );
});

test("guest request operational authority is derived server-side", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, "resolveGuestRequestAuthority({");
  assertContains(source, "requestDefs: hotelConfig?.requestDefs");
  assertContains(source, "requestAuthority.department ?? getDepartmentForRequestType(normalizedType)");
  assertContains(source, "const notifyDepartments = requestAuthority.notifyDepartments;");
  assertContains(source, "const requiresBilling = requestAuthority.requiresBilling;");
  assertContains(source, "const price = requestAuthority.price;");
  assertContains(source, "const currency = requestAuthority.currency;");

  for (const clientAuthorityFragment of [
    "body?.departmentOverride",
    "body.departmentOverride",
    "body?.notifyDepartments",
    "body.notifyDepartments",
    "body?.requiresBilling",
    "body?.price",
    "body?.currency",
  ]) {
    assert.equal(
      source.includes(clientAuthorityFragment),
      false,
      "Public guest request route must not trust " + clientAuthorityFragment,
    );
  }
});

test("server authority preserves free, paid, quantity and custom RequestDef behavior", () => {
  const defs = [
    {
      id: "extra_pillow",
      type: "request",
      enabled: true,
      guestVisible: true,
      requestType: "extra_pillow",
      targetDepartment: "housekeeping",
      requiresBilling: false,
    },
    {
      id: "pillow_menu",
      type: "request",
      enabled: true,
      guestVisible: true,
      requestType: "pillow_menu",
      targetDepartment: "housekeeping",
      notifyDepartments: ["reception"],
      requiresBilling: true,
      price: "11,00",
      currency: "€",
    },
    {
      id: "coffee_capsules",
      type: "request",
      enabled: true,
      guestVisible: true,
      requestType: "coffee_capsules",
      requestKind: "quantity",
      requiresQuantity: true,
      minQty: 1,
      maxQty: 20,
      targetDepartment: "housekeeping",
      notifyDepartments: ["reception"],
      requiresBilling: true,
      price: "2,05",
      currency: "€",
    },
    {
      id: "special_occasion",
      type: "request",
      enabled: true,
      guestVisible: true,
      requestType: "other_reception",
      targetDepartment: "reception",
      requiresBilling: false,
    },
  ];

  assert.deepEqual(
    resolveGuestRequestAuthority({
      requestDefs: defs,
      rawType: "extra_pillow",
      sourceRequestDef: "extra_pillow",
      note: "",
    }),
    {
      ok: true,
      requestType: "extra_pillow",
      department: "housekeeping",
      notifyDepartments: [],
      requiresBilling: false,
      price: null,
      currency: null,
      sourceRequestDef: "extra_pillow",
      quantity: null,
    },
  );

  const pillowMenu = resolveGuestRequestAuthority({
    requestDefs: defs,
    rawType: "pillow_menu",
    sourceRequestDef: "pillow_menu",
    note: "Избрана услуга: Magniflex VIRTUOSO — 11,00 €",
  });
  assert.equal(pillowMenu.ok, true);
  assert.equal(pillowMenu.requiresBilling, true);
  assert.equal(pillowMenu.price, "11,00");
  assert.equal(pillowMenu.currency, "€");
  assert.deepEqual(pillowMenu.notifyDepartments, ["reception"]);

  const coffee = resolveGuestRequestAuthority({
    requestDefs: defs,
    rawType: "coffee_capsules",
    sourceRequestDef: "coffee_capsules",
    note: "Количество: 3\nОбща цена: 6,15 €",
  });
  assert.equal(coffee.ok, true);
  assert.equal(coffee.price, "6,15");
  assert.equal(coffee.quantity, 3);
  assert.equal(coffee.requiresBilling, true);

  const occasion = resolveGuestRequestAuthority({
    requestDefs: defs,
    rawType: "other_reception",
    sourceRequestDef: "special_occasion",
    note: "Рожден ден",
  });
  assert.equal(occasion.ok, true);
  assert.equal(occasion.requestType, "other_reception");
  assert.equal(occasion.department, "reception");
  assert.equal(occasion.sourceRequestDef, "special_occasion");
});

test("server authority rejects unknown or mismatched configured service identities", () => {
  const defs = [
    {
      id: "pillow_menu",
      type: "request",
      enabled: true,
      guestVisible: true,
      requestType: "pillow_menu",
      targetDepartment: "housekeeping",
      requiresBilling: true,
      price: "11,00",
      currency: "€",
    },
  ];

  const missing = resolveGuestRequestAuthority({
    requestDefs: defs,
    rawType: "pillow_menu",
    sourceRequestDef: "not_a_real_service",
    note: "",
  });
  assert.deepEqual(
    { ok: missing.ok, code: missing.code },
    { ok: false, code: "REQUEST_DEF_NOT_FOUND" },
  );

  const mismatch = resolveGuestRequestAuthority({
    requestDefs: defs,
    rawType: "extra_pillow",
    sourceRequestDef: "pillow_menu",
    note: "",
  });
  assert.deepEqual(
    { ok: mismatch.ok, code: mismatch.code },
    { ok: false, code: "REQUEST_TYPE_MISMATCH" },
  );
});

test("legacy billable request types stay billable without trusting client billing fields", () => {
  const laundry = resolveGuestRequestAuthority({
    requestDefs: [],
    rawType: "laundry",
    sourceRequestDef: null,
    note: "Laundry request",
  });

  assert.deepEqual(laundry, {
    ok: true,
    requestType: "laundry",
    department: null,
    notifyDepartments: ["reception"],
    requiresBilling: true,
    price: null,
    currency: null,
    sourceRequestDef: null,
    quantity: null,
  });
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
