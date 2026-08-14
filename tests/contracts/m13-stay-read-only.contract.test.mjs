import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  deriveGuestStayLifecycle,
  getGuestStayAccessPolicy,
} from "../../lib/guest-stays/lifecycle-model.mjs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260814210000_m13_guest_stay_lifecycle.sql", import.meta.url),
  "utf8",
);
const accessSource = readFileSync(
  new URL("../../lib/server/guest-stay-access.ts", import.meta.url),
  "utf8",
);
const guestStaysSource = readFileSync(
  new URL("../../lib/server/guest-stays.ts", import.meta.url),
  "utf8",
);
const stayStatusRoute = readFileSync(
  new URL("../../app/api/guest/stay/status/route.ts", import.meta.url),
  "utf8",
);
const guestRequestsRoute = readFileSync(
  new URL("../../app/api/guest/requests/route.ts", import.meta.url),
  "utf8",
);
const requestCreateRoute = readFileSync(
  new URL("../../app/api/guest/request-create/route.ts", import.meta.url),
  "utf8",
);
const massageRoute = readFileSync(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);
const surveyRoute = readFileSync(
  new URL("../../app/api/guest/day3-survey/route.ts", import.meta.url),
  "utf8",
);
const guestPushRoute = readFileSync(
  new URL("../../app/api/guest/push/subscription/route.ts", import.meta.url),
  "utf8",
);

test("M13 lifecycle model distinguishes active, checkout pending, read-only and ended", () => {
  const nowMs = Date.parse("2026-08-14T12:00:00.000Z");

  assert.equal(
    deriveGuestStayLifecycle({
      status: "active",
      lateCheckoutStatus: "none",
      scheduledCheckOutAt: "2026-08-15T09:00:00.000Z",
      effectiveCheckOutAt: "2026-08-15T09:00:00.000Z",
      nowMs,
    }),
    "active",
  );

  assert.equal(
    deriveGuestStayLifecycle({
      status: "active",
      lateCheckoutStatus: "pending",
      scheduledCheckOutAt: "2026-08-14T09:00:00.000Z",
      effectiveCheckOutAt: "2026-08-14T09:00:00.000Z",
      nowMs,
    }),
    "checkout_pending",
  );

  assert.equal(
    deriveGuestStayLifecycle({
      status: "ended",
      lateCheckoutStatus: "none",
      scheduledCheckOutAt: "2026-08-14T09:00:00.000Z",
      effectiveCheckOutAt: "2026-08-14T09:00:00.000Z",
      nowMs,
    }),
    "read_only",
  );

  assert.equal(
    deriveGuestStayLifecycle({
      status: "cancelled",
      lateCheckoutStatus: "none",
      scheduledCheckOutAt: "2026-08-15T09:00:00.000Z",
      effectiveCheckOutAt: "2026-08-15T09:00:00.000Z",
      nowMs,
    }),
    "ended",
  );
});

test("M13 read-only access keeps history readable but blocks new guest writes", () => {
  assert.deepEqual(getGuestStayAccessPolicy("active"), {
    state: "active",
    canRead: true,
    canWrite: true,
    readOnly: false,
  });
  assert.deepEqual(getGuestStayAccessPolicy("checkout_pending"), {
    state: "checkout_pending",
    canRead: true,
    canWrite: false,
    readOnly: true,
  });
  assert.deepEqual(getGuestStayAccessPolicy("read_only"), {
    state: "read_only",
    canRead: true,
    canWrite: false,
    readOnly: true,
  });
  assert.deepEqual(getGuestStayAccessPolicy("ended"), {
    state: "ended",
    canRead: false,
    canWrite: false,
    readOnly: true,
  });
});

test("M13 migration adds canonical lifecycle state without replacing legacy stay status", () => {
  for (const state of ["active", "checkout_pending", "ended", "read_only"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /add column if not exists lifecycle_state text/);
  assert.match(migration, /guest_stays_lifecycle_state_check/);
  assert.match(migration, /guest_stays_hotel_lifecycle_state_idx/);
  assert.doesNotMatch(migration, /drop column\s+status/i);
  assert.doesNotMatch(migration, /drop table\s+public\.guest_stays/i);
});

test("M13 access authority scopes stay and device reads to the same hotel and room", () => {
  assert.match(accessSource, /\.from\("guest_stays"\)/);
  assert.match(accessSource, /\.eq\("hotel_id", hotelId\)/);
  assert.match(accessSource, /\.eq\("room_number", room\)/);
  assert.match(accessSource, /\.from\("guest_stay_devices"\)/);
  assert.match(accessSource, /\.eq\("stay_id", stayId\)/);
  assert.match(accessSource, /requireGuestStayWriteAccess/);
  assert.match(accessSource, /requireGuestStayReadAccess/);
  assert.match(accessSource, /STAY_CHECKOUT_PENDING/);
  assert.match(accessSource, /STAY_READ_ONLY/);
});

test("M13 shared guest validator derives canonical lifecycle before any mutation can proceed", () => {
  const validatorStart = guestStaysSource.indexOf("export async function validateGuestStayIdentity");
  const validatorEnd = guestStaysSource.indexOf("export async function markLateCheckoutRequested", validatorStart);
  assert.ok(validatorStart >= 0 && validatorEnd > validatorStart, "Expected shared guest validator source.");
  const validatorSource = guestStaysSource.slice(validatorStart, validatorEnd);

  assert.match(validatorSource, /deriveGuestStayLifecycle\(\{/);
  assert.match(validatorSource, /lateCheckoutStatus: currentStay\.late_checkout_status/);
  assert.match(validatorSource, /scheduledCheckOutAt: currentStay\.scheduled_check_out_at/);
  assert.match(validatorSource, /effectiveCheckOutAt: currentStay\.effective_check_out_at/);
  assert.match(validatorSource, /getGuestStayAccessPolicy\(lifecycleState\)/);
  assert.match(validatorSource, /if \(!access\.canWrite\) throw new Error\("STAY_ENDED"\)/);
});

test("M13 status response preserves read access and exposes explicit write capability", () => {
  assert.match(stayStatusRoute, /getGuestStayAccessState/);
  assert.match(stayStatusRoute, /active: access\.canRead/);
  assert.match(stayStatusRoute, /lifecycleState: access\.state/);
  assert.match(stayStatusRoute, /canWrite: access\.canWrite/);
  assert.match(stayStatusRoute, /readOnly: access\.readOnly/);
});

test("M13 request history uses read access while guest mutation routes retain server stay validation", () => {
  assert.match(guestRequestsRoute, /requireGuestStayReadAccess/);
  assert.match(guestRequestsRoute, /\.eq\("stay_id", stayIdentity\.stay\.id\)/);
  assert.match(guestRequestsRoute, /\.eq\("stay_device_id", stayIdentity\.device\.id\)/);

  for (const source of [requestCreateRoute, massageRoute, surveyRoute, guestPushRoute]) {
    assert.match(source, /validateGuestStayIdentity/);
  }
});
