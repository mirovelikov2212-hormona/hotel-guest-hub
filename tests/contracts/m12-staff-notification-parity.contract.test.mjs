import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const STAFF_PAGE_FILES = [
  ["reception", "components/staff/pages/ReceptionPageContent.tsx"],
  ["housekeeping", "components/staff/pages/HousekeepingPageContent.tsx"],
  ["maintenance", "components/staff/pages/MaintenancePageContent.tsx"],
  ["manager", "components/staff/pages/ManagerPageContent.tsx"],
];

test("M12 gives all four staff roles the same sound, tab and push surfaces", async () => {
  for (const [role, file] of STAFF_PAGE_FILES) {
    const source = await readProjectFile(file);
    assertContains(source, "StaffAlertSoundButton");
    assertContains(source, "useStaffAlertSound");
    assertContains(source, "useStaffTabTitleAlert");
    assertContains(source, "ManagerPwaControls");
    assertContains(source, `role=\"${role}\"`);
  }

  const reception = await readProjectFile(
    "components/staff/pages/ReceptionPageContent.tsx",
  );
  assertContains(reception, "useStaffTabTitleAlert(receptionAlertRequests)");
  assertNotContains(reception, "useReceptionTabTitleAlert");
  assertNotContains(reception, "RECEPTION_ALERT_TITLE");
});

test("M12 sound alerts survive browser autoplay restrictions without phantom reload alerts", async () => {
  const source = await readProjectFile("components/staff/useStaffAlertSound.ts");

  assertContains(source, "INITIAL_ALERT_BASELINE_MS");
  assertContains(source, "webkitAudioContext");
  assertContains(source, "ensureAudioContextRunning");
  assertContains(source, 'window.addEventListener("pointerdown", unlockAudio');
  assertContains(source, "playFallbackTone");
  assertContains(source, "seenNewIdsRef.current.add(id)");
  assertContains(source, "!request.isTest");
  assertNotContains(source, "seenNewIdsRef.current = currentNewIds");
});

test("M12 background tab alerts use one shared implementation and do not re-alert transient rows", async () => {
  const source = await readProjectFile("components/staff/useStaffTabTitleAlert.ts");

  assertContains(source, "INITIAL_ALERT_BASELINE_MS");
  assertContains(source, 'document.visibilityState !== "visible"');
  assertContains(source, "!document.hasFocus()");
  assertContains(source, "seenNewIdsRef.current.add(id)");
  assertContains(source, "!request.isTest");
  assertNotContains(source, "seenNewIdsRef.current = currentNewIds");
});

test("M12 keeps exactly one active role per physical push endpoint for a hotel", async () => {
  const genericRoute = await readProjectFile(
    "app/api/staff/push/subscription/route.ts",
  );
  const legacyManagerRoute = await readProjectFile(
    "app/api/staff/push/manager-subscription/route.ts",
  );

  for (const source of [genericRoute, legacyManagerRoute]) {
    assertContains(source, "enforceStaffSameOrigin(req)");
    assertContains(source, '.eq("hotel_id", hotel.id)');
    assertContains(source, '.eq("endpoint", endpoint)');
    assertContains(source, '.neq("role",');
    assertContains(source, '.eq("enabled", true)');
    assertContains(source, ".update({ enabled: false");
  }
});

test("M12 deduplicates staff push delivery by physical endpoint and request", async () => {
  const source = await readProjectFile("lib/staff-push/web-push.ts");

  assertContains(
    source,
    '.select("id, role, endpoint, p256dh, auth, last_seen_at")',
  );
  assertContains(source, "dedupeSubscriptionsByEndpoint");
  assertContains(source, "buildRecentDeliveryKey");
  assertContains(source, "RECENT_DELIVERY_TTL_MS");
  assertContains(source, "stayhub-request-${input.requestId}");
  assertContains(source, "renotify: false");
  assertContains(source, '.eq("hotel_id", input.hotelId)');
});

test("M12 preserves M11 sandbox and test-room live push suppression", async () => {
  const source = await readProjectFile("app/api/guest/request-create/route.ts");

  assertContains(source, "const suppressLivePush = shouldSuppressLivePush");
  assertContains(source, "if (!suppressLivePush)");
  assertContains(source, "sendManagerPushNotification");
  assertContains(source, "sendStaffPushNotification");

  const hotelScope = await readProjectFile("lib/server/hotel-scope.ts");
  assertContains(
    hotelScope,
    "return isSandboxHotel(input.hotel) || Boolean(input.testRoomPolicy?.isTest)",
  );
});
