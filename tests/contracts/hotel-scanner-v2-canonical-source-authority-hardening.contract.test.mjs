import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import {
  deriveHotelPropertyScopeV2,
  isHotelPropertyOperationalContentUrlV2,
} from "../../lib/server/hotel-scanner-v2-property-scope.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function page(url, title, headings = [], description = "") {
  return {
    url,
    title,
    description,
    text: headings.join(" "),
    headings: headings.map((text, index) => ({ level: index === 0 ? 1 : 3, text })),
    contentBlocks: [],
    links: [],
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    jsonLdEntities: [],
  };
}

function detail(url, title, primaryType, domain) {
  return {
    url,
    title,
    resourceType: "page",
    crawled: true,
    variantGroupId: url.replace(/^https?:\/\//u, ""),
    languages: ["en"],
    classification: { primaryType, types: [primaryType, domain], confidence: 1, signals: [] },
    inventoryHints: [],
  };
}

test("named hotel facilities outrank embedded FAQ or generic body semantics", () => {
  const cases = [
    ["https://hotel.test/property/de/fitnessstudio", "Fitnessstudio", "experience_detail"],
    ["https://hotel.test/property/de/hallenbad", "Hallenbad", "experience_detail"],
    ["https://hotel.test/property/de/spielzimmer", "Spielzimmer", "experience_detail"],
    ["https://hotel.test/property/de/disko", "Disko", "experience_detail"],
    ["https://hotel.test/property/en/info-corner", "Info Corner", "service_detail"],
  ];

  for (const [url, title, expected] of cases) {
    const classified = classifyHotelScannerPageV2(page(url, title, [title, "Frequently Asked Questions", "Hotel services"]));
    assert.equal(classified.primaryType, expected, title);
  }
});

test("generic body service words cannot turn legal editorial or opaque pages into hotel services", () => {
  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/de/fernabsatzvertrag",
      "Fernabsatzvertrag",
      ["Fernabsatzvertrag", "Services", "Facilities"],
    )).primaryType,
    "policies",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/de/punktleiste",
      "Punktleiste",
      ["Punktleiste", "Services", "Facilities"],
    )).primaryType,
    "other",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/de/reisefuhrer-region-geschichte-und-mittelmeerflair-entdecken",
      "Reiseführer Region: Geschichte und Mittelmeerflair Entdecken",
      ["Services", "Facilities"],
    )).primaryType,
    "other",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/de/hotel-premium",
      "Festliche Konzerte im Hotel wurden zur Bühne für unvergessliche Momente",
      ["Services", "Facilities"],
    )).primaryType,
    "other",
  );
});

test("commercial campaign titles route to offers before facility semantics", () => {
  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/de/zwei-kinder-bis-1299-jahre-kostenlos",
      "Zwei Kinder bis 12,99 Jahre kostenlos!",
      ["Hotel services"],
    )).primaryType,
    "offer_detail",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/tr/minik-misafirlere-ozel-isitmali-havuz-keyfi",
      "Minik Misafirlere Özel Isıtmalı Havuz Keyfi!",
      ["Heated Pool"],
    )).primaryType,
    "offer_detail",
  );

  assert.equal(
    classifyHotelScannerPageV2(page(
      "https://hotel.test/property/en/premium-honeymoon-privileges",
      "Premium Honeymoon Privileges",
      ["Pool", "Spa"],
    )).primaryType,
    "offer_detail",
  );
});

test("article-style guide slugs are excluded from operational crawl while hotel facilities and commercial pages remain eligible", () => {
  const scope = deriveHotelPropertyScopeV2("https://hotel.test/property");

  assert.equal(isHotelPropertyOperationalContentUrlV2("https://hotel.test/property/de/reisefuhrer-region-geschichte-entdecken", scope), false);
  assert.equal(isHotelPropertyOperationalContentUrlV2("https://hotel.test/property/de/fitnessstudio", scope), true);
  assert.equal(isHotelPropertyOperationalContentUrlV2("https://hotel.test/property/en/summer-family-package", scope), true);
});

test("canonical registry requires semantic hotel-object identity for service and experience detail pages", () => {
  const registry = buildCanonicalHotelEntityRegistryV2({
    resources: [
      detail("https://hotel.test/property/en/distance-selling-agreement", "Distance Selling Agreement", "service_detail", "services"),
      detail("https://hotel.test/property/en/travel-guide", "Travel Guide Region", "service_detail", "services"),
      detail("https://hotel.test/property/en/info-corner", "Info Corner", "service_detail", "services"),
      detail("https://hotel.test/property/de/hallenbad", "Hallenbad", "experience_detail", "experiences"),
      detail("https://hotel.test/property/de/spielzimmer", "Spielzimmer", "experience_detail", "experiences"),
      detail("https://hotel.test/property/de/fitnessstudio", "Fitnessstudio", "experience_detail", "experiences"),
      detail("https://hotel.test/property/de/disko", "Disko", "experience_detail", "experiences"),
      detail("https://hotel.test/property/en/families-special-heated-pool", "Families Special Heated Pool Privilege", "experience_detail", "experiences"),
    ],
  });

  const services = registry.domains.get("services");
  const experiences = registry.domains.get("experiences");

  assert.deepEqual(services.expectedItems.map((item) => item.nameHint), ["Info Corner"]);
  assert.deepEqual(
    experiences.expectedItems.map((item) => item.nameHint).sort(),
    ["Disko", "Fitnessstudio", "Hallenbad", "Spielzimmer"].sort(),
  );
});

test("source-authority implementation stays generic", async () => {
  const sources = await Promise.all([
    readProjectFile("lib/server/hotel-scanner-v2-hospitality-taxonomy.mjs"),
    readProjectFile("lib/server/hotel-scanner-v2-page-classifier.mjs"),
    readProjectFile("lib/server/hotel-scanner-v2-property-scope.mjs"),
    readProjectFile("lib/server/hotel-scanner-v2-canonical-registry.mjs"),
  ]);

  assert.doesNotMatch(sources.join("\n"), /kirmanpremium|arycanda|evrika/iu);
});
