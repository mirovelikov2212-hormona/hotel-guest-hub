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

test("Cyrillic marketing sentences are not promoted to gastronomy entities", () => {
  const realVenues = ["Forum Restaurant", "NERO Dining Club", "Lobby Bar", "Nutri Bar", "Night Bar"];
  const siteMap = {
    resources: [
      resource("https://hotel.test/gastronomy", "https://hotel.test/gastronomy", "gastronomy", [
        ...realVenues,
        "Всяко ястие разказва историята на тази земя",
      ]),
    ],
  };

  const gastronomy = buildCanonicalHotelEntityRegistryV2(siteMap).domains.get("gastronomy");
  assert.equal(gastronomy.expectedCount, 5);
  assert.deepEqual(gastronomy.expectedItems.map((item) => item.nameHint), realVenues);
});

test("richer valid accommodation sibling is authoritative and every entity retains the logical source family", () => {
  const sixRooms = ["Economy Room", "Standard Room", "Studio", "One-Bedroom Apartment", "Grand Deluxe Apartment", "VIP Apartment"];
  const rootUrl = "https://hotel.test/rooms";
  const roUrl = "https://hotel.test/ro/rooms";
  const siteMap = {
    resources: [
      resource(rootUrl, "https://hotel.test/rooms", "accommodation", sixRooms, "bg"),
      resource(roUrl, "https://hotel.test/rooms", "accommodation", ["Studio", "One-Bedroom Apartment", "Grand Deluxe Apartment", "VIP Apartment"], "ro"),
    ],
  };

  const registry = buildCanonicalHotelEntityRegistryV2(siteMap);
  const accommodation = registry.domains.get("accommodation");
  assert.equal(accommodation.expectedCount, 6);
  assert.deepEqual(accommodation.expectedItems.map((item) => item.nameHint), sixRooms);
  assert.deepEqual(new Set(accommodation.landingUrls), new Set([rootUrl, roUrl]));
  for (const item of accommodation.expectedItems) {
    assert.deepEqual(new Set(item.urls), new Set([rootUrl, roUrl]));
    assert.deepEqual(item.languages, ["bg", "ro"]);
  }
});

test("SPA doctor and team pages remain supporting evidence rather than expected guest-facing SPA entities", () => {
  const spaDetail = (url, title, group) => ({
    url,
    title,
    resourceType: "page",
    variantGroupId: group,
    crawled: true,
    canonicalTarget: url,
    languages: ["de"],
    classification: { primaryType: "spa_detail", types: ["spa_detail", "spa"] },
    inventoryHints: [],
    structuralInventory: null,
  });
  const treatmentUrl = "https://hotel.test/de/healing/thermal-therapy";
  const doctorsUrl = "https://hotel.test/de/healing/doctors";
  const siteMap = {
    resources: [
      spaDetail(treatmentUrl, "Thermal Therapy", "hotel.test/healing/thermal-therapy"),
      spaDetail(doctorsUrl, "Unsere Ärzte — Hotel", "hotel.test/healing/doctors"),
    ],
  };

  const spa = buildCanonicalHotelEntityRegistryV2(siteMap).domains.get("spa");
  assert.equal(spa.expectedCount, 1);
  assert.equal(spa.expectedItems[0].nameHint, "Thermal Therapy");
  assert.deepEqual(spa.supportingUrls, [doctorsUrl]);
});
