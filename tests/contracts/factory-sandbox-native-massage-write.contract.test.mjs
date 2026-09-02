import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../../app/api/guest/massages/route.ts", import.meta.url),
  "utf8",
);

test("Factory Sandbox native massage writes do not depend on a hotel-specific external adapter flag", () => {
  assert.match(
    route,
    /sandboxNativeBookingEnabled\s*=\s*[\s\S]*isSandboxHotel\(hotel\)[\s\S]*isNativeMassageAuthority\(runtimeAuthority\)/,
  );
  assert.match(
    route,
    /if \(!sandboxNativeBookingEnabled && !controlledE2EEnabled && !productionBookingEnabled\)/,
  );
});

test("Production and non-native Sandbox massage writes remain fail-closed", () => {
  assert.match(route, /isMassageBookingPostEnabled\(hotelSlug\)/);
  assert.match(route, /code: "MASSAGE_BOOKING_POST_DISABLED"/);
  assert.doesNotMatch(route, /isSandboxHotel\(hotel\)\s*\|\|\s*productionBookingEnabled/);
});
