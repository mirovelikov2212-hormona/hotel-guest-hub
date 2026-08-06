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
