import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveGuestRootEntry } from "../../lib/server/guest-root-entry.mjs";

test("Vercel Preview root is isolated in the configured sandbox guest hub", () => {
  assert.equal(
    resolveGuestRootEntry({
      host: "hotel-guest-abc-miroslav-velikovs-projects.vercel.app",
      vercelEnv: "preview",
      previewHotelSlug: "aquamarine-test",
    }),
    "/h/aquamarine-test",
  );
});

test("Production StayHub routing keeps hotel subdomains authoritative", () => {
  assert.equal(
    resolveGuestRootEntry({ host: "aquamarine.stayhub.app", vercelEnv: "production" }),
    "/h/aquamarine",
  );
  assert.equal(
    resolveGuestRootEntry({ host: "stayhub.app", vercelEnv: "production" }),
    "/h/demo",
  );
});

test("invalid preview slug cannot escape the hotel route", () => {
  assert.equal(
    resolveGuestRootEntry({
      host: "example.vercel.app",
      vercelEnv: "preview",
      previewHotelSlug: "../../admin",
    }),
    "/h/aquamarine-test",
  );
});

test("root page preserves query parameters and delegates routing to the shared resolver", async () => {
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /resolveGuestRootEntry/);
  assert.match(source, /process\.env\.VERCEL_ENV/);
  assert.match(source, /process\.env\.STAYHUB_PREVIEW_HOTEL_SLUG/);
  assert.match(source, /Object\.entries\(sp \|\| \{\}\)/);
  assert.doesNotMatch(source, /redirect\("\/h\/demo"\)/);
});

test("stay confirmation translates relational inactive-room enforcement into guest validation", async () => {
  const source = await readFile(new URL("../../app/api/guest/stay/confirm/route.ts", import.meta.url), "utf8");
  assert.match(source, /GUEST_STAY_ROOM_NOT_ACTIVE/);
  assert.match(source, /INVALID_ROOM/);
});
