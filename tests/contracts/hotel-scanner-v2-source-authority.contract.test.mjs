import assert from "node:assert/strict";
import test from "node:test";

import { selectHotelScannerPrimaryPageUrlsV2 } from "../../lib/ai/hotel-scanner-v2-source-selection.mjs";
import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";

function resource(url, variantGroupId, primaryType, candidates, language = "bg") {
  return {
    url,
    resourceType: "page",
    variantGroupId,
    crawled: true,
    canonicalTarget: url,
    languages: [language],
    classification: { primaryType, types: [primaryType] },
    inventoryHints: [],
    structuralInventory: {
      domain: primaryType === "gastronomy" ? "gastronomy" : "accommodation",
      candidates: candidates.map((name) => ({ name, entityType: primaryType === "gastronomy" ? "venue" : "room_type" })),
    },
  };
}

test("primary source selector collapses translated variants to the canonical logical page", () => {
  const siteMap = {
    resources: [
      resource("https://hotel.test/gastronomy", "https://hotel.test/gastronomy", "gastronomy", [], "bg"),
      resource("https://hotel.test/en/gastronomy", "https://hotel.test/gastronomy", "gastronomy", [], "en"),
      resource("https://hotel.test/mk/gastronomy", "https://hotel.test/gastronomy", "gastronomy", [], "mk"),
    ],
  };

  const selected = selectHotelScannerPrimaryPageUrlsV2(
    siteMap,
    siteMap.resources.map((item) => item.url),
    "https://hotel.test/",
  );

  assert.deepEqual(selected, ["https://hotel.test/gastronomy"]);
});

test("canonical registry never lets a translated landing with more headings override the primary language landing", () => {
  const realVenues = ["Forum Restaurant", "NERO Dining Club", "Lobby Bar", "Nutri Bar", "Night Bar"];
  const siteMap = {
    resources: [
      resource("https://hotel.test/gastronomy", "https://hotel.test/gastronomy", "gastronomy", realVenues, "bg"),
      resource("https://hotel.test/mk/gastronomy", "https://hotel.test/gastronomy", "gastronomy", [
        "Гастрономија",
        "Нашите ресторани",
        "Кулинарскиот свет однатре",
        ...realVenues,
      ], "mk"),
    ],
  };

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const gastronomy = registry.domains.get("gastronomy");

  assert.equal(gastronomy.expectedCount, 5);
  assert.deepEqual(gastronomy.expectedItems.map((item) => item.nameHint), realVenues);
  assert.equal(gastronomy.landingUrls[0], "https://hotel.test/gastronomy");
});

test("generic translated section headings are not hotel entities", () => {
  const realVenues = ["Forum Restaurant", "NERO Dining Club", "Lobby Bar", "Nutri Bar", "Night Bar"];
  const siteMap = {
    resources: [
      resource("https://hotel.test/mk/gastronomy", "https://hotel.test/gastronomy", "gastronomy", [
        "Гастрономија",
        "Нашите ресторани",
        "Кулинарскиот свет однатре",
        ...realVenues,
      ], "mk"),
    ],
  };

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const gastronomy = registry.domains.get("gastronomy");
  assert.equal(gastronomy.expectedCount, 5);
  assert.deepEqual(gastronomy.expectedItems.map((item) => item.nameHint), realVenues);
});

test("primary accommodation landing is authoritative over thinner translated variants", () => {
  const sixRooms = ["Economy Room", "Standard Room", "Studio", "One-Bedroom Apartment", "Grand Deluxe Apartment", "VIP Apartment"];
  const siteMap = {
    resources: [
      resource("https://hotel.test/rooms", "https://hotel.test/rooms", "accommodation", sixRooms, "bg"),
      resource("https://hotel.test/ro/rooms", "https://hotel.test/rooms", "accommodation", ["Studio", "One-Bedroom Apartment", "Grand Deluxe Apartment", "VIP Apartment"], "ro"),
    ],
  };

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const accommodation = registry.domains.get("accommodation");
  assert.equal(accommodation.expectedCount, 6);
  assert.deepEqual(accommodation.expectedItems.map((item) => item.nameHint), sixRooms);
});
