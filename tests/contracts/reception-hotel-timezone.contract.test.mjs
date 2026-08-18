import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receptionPagePath = new URL(
  "../../components/staff/pages/ReceptionPageContent.tsx",
  import.meta.url,
);
const scopedPagePath = new URL(
  "../../app/staff/[hotelSlug]/reception/page.tsx",
  import.meta.url,
);
const hotelLookupPath = new URL(
  "../../lib/hotels/getHotelByAnySlug.ts",
  import.meta.url,
);

const [receptionPage, scopedPage, hotelLookup] = await Promise.all([
  readFile(receptionPagePath, "utf8"),
  readFile(scopedPagePath, "utf8"),
  readFile(hotelLookupPath, "utf8"),
]);

test("Reception daily history renders request timestamps in the configured hotel timezone", () => {
  assert.doesNotMatch(receptionPage, /const HOTEL_TIME_ZONE = "UTC"/);
  assert.match(receptionPage, /hotelTimeZone: string/);
  assert.match(receptionPage, /timeZone: hotelTimeZone/);
  assert.match(
    receptionPage,
    /formatHotelTime\(request\.createdAtIso, hotelTimeZone\)/,
  );
  assert.match(
    receptionPage,
    /getHotelDateKey\(request\.createdAtIso, hotelTimeZone\)/,
  );
});

test("Reception resolves timezone from the exact hotel row instead of an Aquamarine hardcode", () => {
  assert.match(hotelLookup, /active, timezone/);
  assert.match(scopedPage, /getHotelByAnySlug\(hotelSlug\)/);
  assert.match(scopedPage, /hotel\.timezone/);
  assert.match(scopedPage, /hotelTimeZone=\{hotelTimeZone\}/);
  assert.doesNotMatch(scopedPage, /Europe\/Sofia/);
  assert.doesNotMatch(receptionPage, /Europe\/Sofia/);
});
