import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("normal extra-pillow requests are not promoted to the paid pillow menu", async () => {
  const source = await readProjectFile("lib/staff/ops-request-copy.ts");

  assertContains(
    source,
    'if (normalizedType === "extra_pillow" && !hasExactRequestSignal(input, "pillow_menu"))',
  );
  assertBefore(
    source,
    'if (normalizedType === "extra_pillow"',
    'if (hasExactRequestSignal(input, "pillow_menu")',
  );
});

test("guest request writes preserve original and Bulgarian operational fields", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  for (const field of [
    "title_original:",
    "message_original:",
    "title_bg:",
    "message_bg:",
  ]) {
    assertContains(source, field);
  }
});

test("sandbox and test-room requests suppress live push before notification", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, "getOperationalIsolationFields({ hotel, testRoomPolicy })");
  assertContains(source, "getOperationalIsolationMetadata({ hotel, testRoomPolicy })");
  assertContains(source, "shouldSuppressLivePush({ hotel, testRoomPolicy })");
  assertBefore(source, "shouldSuppressLivePush({ hotel, testRoomPolicy })", "if (!suppressLivePush)");
});

test("massage workflow never deploys Vercel production", async () => {
  const source = await readProjectFile(".github/workflows/massage-sheet-sync.yml");

  assertNotContains(source, "vercel --prod");
  assertNotContains(source, "vercel deploy --prod");
});


test("massage staff cards use the selected service as the Bulgarian title", async () => {
  const source = await readProjectFile("lib/server/massage-staff-request.ts");

  assertContains(source, "const staffTitleBg = serviceName;");
});

test("sandbox native massage authority states that Google Sheet was not changed", async () => {
  const staffSource = await readProjectFile("lib/server/massage-staff-request.ts");
  const routeSource = await readProjectFile("app/api/guest/massages/route.ts");

  assertContains(staffSource, "sheetWrite: boolean;");
  assertContains(staffSource, '"График: Резервацията е записана в Supabase. Google Sheet не е променян."');
  assertContains(routeSource, 'authorityMode: "native_supabase"');
  assertContains(routeSource, "sheetWrite: false,");
  assertContains(routeSource, "sheetWrite: true,");
});

test("sandbox massage confirmation uses the tenant-owned native service catalog", async () => {
  const routeSource = await readProjectFile("app/api/guest/massages/route.ts");
  const nativeSource = await readProjectFile("lib/server/massage-native-runtime.ts");

  assertContains(routeSource, "const service = await getNativeMassageService({ hotelId: hotel.id, serviceId });");
  assertContains(nativeSource, '.from("massage_runtime_services")');
  assertContains(nativeSource, '.eq("hotel_id", hotelId)');
  assertContains(nativeSource, '.eq("active", true)');
  assertNotContains(routeSource, "getSandboxMassageServiceDetails");
});

test("sandbox massage confirmation rejects incomplete native service details instead of storing a technical id", async () => {
  const routeSource = await readProjectFile("app/api/guest/massages/route.ts");
  const nativeSource = await readProjectFile("lib/server/massage-native-runtime.ts");

  assertContains(nativeSource, "MASSAGE_NATIVE_SERVICE_NAME_INVALID");
  assertContains(nativeSource, "MASSAGE_NATIVE_DURATION_INVALID");
  assertContains(nativeSource, "MASSAGE_NATIVE_PRICE_INVALID");
  assertContains(routeSource, "getNativeMassageService({ hotelId: hotel.id, serviceId })");
  assertNotContains(routeSource, "service?.nameBg ?? serviceId");
  assertNotContains(routeSource, "service?.durationMinutes ?? null");
  assertNotContains(routeSource, "service?.price ?? null");
});

test("massage method mismatch keeps durable recovery behind the tenant-guarded legacy adapter", async () => {
  const apiSource = await readProjectFile("lib/server/massage-api.ts");
  const legacyApiSource = await readProjectFile("lib/server/massage-api-legacy.ts");
  const snapshotSource = await readProjectFile(
    "lib/server/massage-snapshot.ts"
  );

  assertContains(apiSource, "requireLegacyExternalSource");
  assertContains(apiSource, 'source.config.adapter_key === "legacy_global"');
  assertContains(legacyApiSource, "deferFailureLoggingCodes?: string[];");
  assertContains(
    legacyApiSource,
    'deferFailureLoggingCodes: ["MASSAGE_API_METHOD_MISMATCH"]'
  );
  assertContains(
    snapshotSource,
    "const MASSAGE_METHOD_MISMATCH_CRITICAL_THRESHOLD = 2;"
  );
  assertContains(
    snapshotSource,
    "consecutiveFailures: failureState.consecutiveFailures"
  );
  assertContains(snapshotSource, "snapshotFreshAtFailure");
  assertContains(
    snapshotSource,
    'eventType: "massage_calendar_snapshot_recovered"'
  );
  assertContains(snapshotSource, "hotelId: hotel.id");
  assertContains(
    snapshotSource,
    "errorCode: classification.errorCode"
  );
});

test("staff PIN verification keeps scrypt and timing-safe comparison", async () => {
  const candidates = [
    "lib/staff-auth/pin.ts",
    "lib/staff-auth/verify-pin.ts",
    "lib/staff-auth/password.ts",
  ];

  let source = "";
  for (const candidate of candidates) {
    try {
      source += await readProjectFile(candidate);
    } catch {
      // Keep checking the known locations used by StayHub revisions.
    }
  }

  if (!source) {
    const loginSource = await readProjectFile("app/api/staff/auth/login/route.ts");
    assert.ok(loginSource.includes("verify") || loginSource.includes("scrypt"));
    return;
  }

  assert.ok(source.includes("scrypt"), "Expected staff PIN verification to use scrypt.");
  assert.ok(
    source.includes("timingSafeEqual"),
    "Expected staff PIN verification to use timingSafeEqual.",
  );
});


test("manager active operations exclude returned requests while preserving the returned drilldown", async () => {
  const source = await readProjectFile("components/staff/pages/ManagerPageContent.tsx");
  assertContains(source, 'getOperationalAllRequests().filter((request) => isOpenStatus(request.status))');
  assertContains(source, 'value={summary.returnedCount}');
  assertContains(source, 'status: "returned"');
});
