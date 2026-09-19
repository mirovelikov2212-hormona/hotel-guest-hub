import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalHotelEntityRegistryV2 } from "../../lib/server/hotel-scanner-v2-canonical-registry.mjs";
import { buildHotelInventoryV2 } from "../../lib/server/hotel-scanner-v2-inventory.mjs";
import { deriveHotelPageInventoryHintsV2 } from "../../lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { buildHotelSiteMapV2 } from "../../lib/server/hotel-scanner-v2-site-map.mjs";
import { extractHotelPageStructureV2 } from "../../lib/server/hotel-scanner-v2-page-structure.mjs";
import { classifyHotelScannerPageV2 } from "../../lib/server/hotel-scanner-v2-page-classifier.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function offerHint(names, count = names.length) {
  return {
    domain: "offers",
    expectedCount: count,
    explicitCount: count,
    identifiedCount: names.length,
    confidence: "HIGH",
    consistency: count === names.length ? "CONSISTENT" : "PARTIAL",
    candidates: names.map((name, index) => ({
      name,
      entityType: "offer",
      basis: "authoritative_offer_card",
      score: 8,
      links: [`https://hotel.test/en/shared-campaign-${index + 1}`],
    })),
  };
}

function offerLanding(url, language, names, variantGroupId = "hotel.test/property/offers") {
  return {
    url,
    resourceType: "page",
    crawled: true,
    variantGroupId,
    title: language === "de" ? "Angebote" : language === "tr" ? "Teklifler" : "Offers",
    languages: [language],
    classification: { primaryType: "offers", types: ["offers"], confidence: 1, signals: [] },
    inventoryHints: [offerHint(names)],
  };
}

function offerDetail(index, title = `Shared Campaign ${index}`) {
  return {
    url: `https://hotel.test/en/shared-campaign-${index}`,
    resourceType: "page",
    crawled: true,
    variantGroupId: `hotel.test/shared-campaign-${index}`,
    title,
    languages: ["en"],
    classification: { primaryType: "offer_detail", types: ["offer_detail", "offers"], confidence: 1, signals: ["delegated_offer_detail"] },
    inventoryHints: [],
  };
}

test("explicit localized hotel landing paths outrank long CMS SEO titles", () => {
  const cases = [
    ["https://hotel.test/property/en/offers", "Exclusive Holiday Offers and Privileges Designed for an Unforgettable Premium Hotel Stay", "offers"],
    ["https://hotel.test/property/de/angebote", "Exklusive Urlaubsvorteile und Angebote für einen unvergesslichen Aufenthalt in unserem Premium Hotel", "offers"],
    ["https://hotel.test/property/tr/teklifler", "Premium Otel Konaklamanız İçin Size Özel Ayrıcalıklar ve Tatil Teklifleri Burada", "offers"],
    ["https://hotel.test/property/en/rooms", "Discover Our Comfortable Rooms and Suites for Your Perfect Premium Holiday Experience", "accommodation"],
    ["https://hotel.test/property/en/gastronomy", "Discover Exceptional Restaurants Bars and Culinary Experiences Throughout Your Premium Hotel Stay", "gastronomy"],
  ];

  for (const [url, title, expected] of cases) {
    const classified = classifyHotelScannerPageV2({
      url,
      title,
      description: "",
      headings: [{ level: 1, text: title }],
      contentBlocks: [],
      links: [],
      navigationLinks: [],
      documentUrls: [],
      canonicalHint: "",
      language: "en",
      languageAlternates: [],
      jsonLdEntities: [],
      text: title,
    });
    assert.equal(classified.primaryType, expected, url);
    assert.ok(classified.signals.some((signal) => signal.startsWith("landing_path_authority:")), url);
  }
});

test("explicit offer-detail CTA links outrank unrelated linked cards on an Offers landing", () => {
  const html = `
    <main>
      <h1>Offers</h1>
      <section>
        <a href="/en/heated-pool-privilege">A Heated Pool Privilege Special for Little Guests! <span>DETAILED REVIEW</span></a>
        <a href="/en/two-children-stay-free">Two Children up to 12.99 Years Stay Free! <span>DETAILED REVIEW</span></a>
      </section>
      <section>
        <h2>Concepts</h2>
        <a href="/en/premium-family">Premium Family</a>
        <a href="/en/ultra-all-inclusive">Ultra All Inclusive</a>
      </section>
    </main>
  `;
  const structure = extractHotelPageStructureV2(html);
  const hints = deriveHotelPageInventoryHintsV2({
    url: "https://hotel.test/property/en/offers",
    title: "Offers",
    description: "",
    text: "Offers",
    ...structure,
  }, {
    primaryType: "offers",
    types: ["offers"],
    confidence: 1,
    signals: [],
  });
  const offers = hints.find((hint) => hint.domain === "offers");

  assert.ok(offers);
  assert.equal(offers.expectedCount, 2);
  assert.equal(offers.confidence, "HIGH");
  assert.deepEqual(offers.candidates.map((candidate) => candidate.name).sort(), [
    "A Heated Pool Privilege Special for Little Guests!",
    "Two Children up to 12.99 Years Stay Free!",
  ].sort());
  assert.ok(offers.candidates.every((candidate) => candidate.basis === "authoritative_offer_detail_link"));
  assert.deepEqual(offers.candidates.map((candidate) => candidate.links[0]).sort(), [
    "/en/heated-pool-privilege",
    "/en/two-children-stay-free",
  ].sort());
});

test("Offers extraction keeps late CTA cards beyond the first 24 anchors in a content block", () => {
  const noise = Array.from({ length: 18 }, (_, index) => `<a href="/info-${index}">Info ${index}</a>`).join("");
  const cards = Array.from({ length: 7 }, (_, index) =>
    `<a href="/en/offer-${index + 1}">Exclusive Benefit ${index + 1} <span>DETAILED REVIEW</span></a>`).join("");
  const structure = extractHotelPageStructureV2(`<main><h1>Offers</h1>${noise}${cards}</main>`);
  const hints = deriveHotelPageInventoryHintsV2({
    url: "https://hotel.test/property/en/offers",
    title: "Offers",
    description: "",
    text: "Offers",
    ...structure,
  }, { primaryType: "offers", types: ["offers"], confidence: 1, signals: [] });
  const offers = hints.find((hint) => hint.domain === "offers");
  assert.equal(offers?.expectedCount, 7);
  assert.equal(offers?.candidates.length, 7);
});

test("Offers landing authority prefers richer named membership over a smaller exact-count localization", () => {
  const rich = offerLanding("https://hotel.test/property/en/offers", "en", [
    "Benefit One", "Benefit Two", "Benefit Three", "Benefit Four", "Benefit Five", "Benefit Six", "Benefit Seven",
  ]);
  rich.inventoryHints[0].explicitCount = null;
  rich.inventoryHints[0].expectedCount = 7;
  const smaller = offerLanding("https://hotel.test/property/de/angebote", "de", [
    "Vorteil Eins", "Vorteil Zwei", "Vorteil Drei", "Vorteil Vier", "Vorteil Fünf", "Vorteil Sechs",
  ]);
  const inventory = buildHotelInventoryV2({ resources: [rich, smaller] });
  const offers = inventory.domains.find((domain) => domain.domain === "offers");
  assert.equal(offers?.expectedCount, 7);
  assert.equal(offers?.evidence.landingIdentifiedCount, 7);
  assert.deepEqual(offers?.evidence.observedLandingCounts, [6, 7]);
});

test("an authoritative Offers landing accepts linked campaign cards without offer keywords in their titles", () => {
  const page = {
    url: "https://hotel.test/property/en/offers",
    title: "Offers",
    description: "",
    text: "Offers",
    contentBlocks: [
      { heading: "Private Reformer Pilates Lesson Throughout Your Holiday", text: "", links: ["/en/pilates-privilege"] },
      { heading: "Two Children Stay Free", text: "", links: ["/en/two-children-stay-free"] },
      { heading: "Website Reservation Privileges", text: "", links: ["/en/website-reservation-privileges"] },
    ],
    jsonLdEntities: [],
  };
  const hints = deriveHotelPageInventoryHintsV2(page, {
    primaryType: "offers",
    types: ["offers"],
    confidence: 1,
    signals: [],
  });
  const offers = hints.find((hint) => hint.domain === "offers");

  assert.ok(offers);
  assert.equal(offers.expectedCount, 3);
  assert.deepEqual(
    offers.candidates.map((candidate) => candidate.name).sort(),
    [
      "Private Reformer Pilates Lesson Throughout Your Holiday",
      "Two Children Stay Free",
      "Website Reservation Privileges",
    ].sort(),
  );
  assert.ok(offers.candidates.every((candidate) => candidate.basis === "authoritative_offer_card"));
});

test("localized Offers landing URLs collapse to one logical landing family without hreflang", () => {
  const base = {
    description: "",
    text: "",
    links: [],
    contentLinks: [],
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    languageAlternates: [],
    headings: [],
    jsonLdEntities: [],
    contentBlocks: [],
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
  };
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/property/en/offers",
    pages: [
      { ...base, url: "https://hotel.test/property/en/offers", title: "Offers", language: "en" },
      { ...base, url: "https://hotel.test/property/de/angebote", title: "Angebote", language: "de" },
      { ...base, url: "https://hotel.test/property/tr/teklifler", title: "Teklifler", language: "tr" },
    ],
  });
  const landings = siteMap.resources.filter((resource) => resource.classification.primaryType === "offers");
  assert.equal(landings.length, 3);
  assert.equal(new Set(landings.map((resource) => resource.variantGroupId)).size, 1);
});

test("delegated same-origin leaf evidence is deterministically an offer detail with explicit provenance", () => {
  const siteMap = buildHotelSiteMapV2({
    canonicalUrl: "https://hotel.test/property/en/offers",
    pages: [{
      url: "https://hotel.test/en/private-pilates-privilege",
      title: "Private Reformer Pilates Lesson Throughout Your Holiday",
      description: "",
      text: "",
      links: [],
      contentLinks: [],
      navigationLinks: [],
      documentUrls: [],
      canonicalHint: "",
      language: "en",
      languageAlternates: [],
      headings: [],
      jsonLdEntities: [],
      contentBlocks: [],
      delegatedOfferDetailUrls: [],
      delegatedAuthority: {
        domain: "offers",
        sourceUrl: "https://hotel.test/property/en/offers",
        kind: "direct_content_link",
      },
    }],
  });

  const detail = siteMap.resources.find((resource) => resource.url === "https://hotel.test/en/private-pilates-privilege");
  assert.equal(detail.classification.primaryType, "offer_detail");
  assert.ok(detail.classification.signals.includes("delegated_offer_detail"));
  assert.equal(detail.delegatedAuthority.domain, "offers");
  assert.ok(siteMap.relations.some((relation) =>
    relation.kind === "delegated_offer_detail"
    && relation.fromUrl === "https://hotel.test/property/en/offers"
    && relation.toUrl === detail.url));
});

test("localized count variance is audit evidence, not a blocking Offers conflict", () => {
  const richest = [
    "Heated Pool Privilege",
    "Honeymoon Privileges",
    "Sapling Donation",
    "Private Pilates Lesson",
    "Baby Comfort Package",
    "Children Stay Free",
    "Website Reservation Privileges",
  ];
  const inventory = buildHotelInventoryV2({
    resources: [
      offerLanding("https://hotel.test/property/en/offers", "en", richest),
      offerLanding("https://hotel.test/property/de/angebote", "de", richest.slice(0, 4)),
      offerLanding("https://hotel.test/property/tr/teklifler", "tr", richest.slice(0, 3)),
    ],
  });
  const offers = inventory.domains.find((domain) => domain.domain === "offers");

  assert.equal(offers.expectationState, "DETERMINISTIC");
  assert.equal(offers.expectedCount, 7);
  assert.deepEqual(offers.evidence.observedLandingCounts, [3, 4, 7]);
  assert.equal(offers.evidence.authority, "LOCALIZED_OFFER_LANDING_FAMILY");
  assert.ok(offers.issues.includes("localized_offer_inventory_variance"));
  assert.ok(!offers.issues.includes("landing_inventory_count_conflict"));
});

test("property Offers landing owns membership while directly linked details own content", () => {
  const names = [
    "Heated Pool Privilege",
    "Honeymoon Privileges",
    "Sapling Donation",
    "Private Pilates Lesson",
  ];
  const en = offerLanding("https://hotel.test/property/en/offers", "en", names);
  const de = offerLanding("https://hotel.test/property/de/angebote", "de", names.slice(0, 3));
  const details = names.map((name, index) => offerDetail(index + 1, `Localized Detail Title ${index + 1}`));
  const stray = {
    ...offerDetail(99, "Unlisted Global Campaign"),
    url: "https://hotel.test/en/unlisted-global-campaign",
    variantGroupId: "hotel.test/unlisted-global-campaign",
  };

  const registry = buildCanonicalHotelEntityRegistryV2({ resources: [en, de, ...details, stray] });
  const offers = registry.domains.get("offers");

  assert.equal(offers.expectationState, "DETERMINISTIC");
  assert.equal(offers.expectedCount, 4);
  assert.equal(offers.evidence.authority, "PROPERTY_OFFERS_LANDING");
  assert.deepEqual(offers.evidence.observedLandingCounts, [3, 4]);
  assert.ok(offers.issues.includes("localized_offer_inventory_variance"));
  assert.ok(!offers.expectedItems.some((item) => item.nameHint === "Unlisted Global Campaign"));
  assert.ok(offers.supportingUrls.includes("https://hotel.test/en/unlisted-global-campaign"));
  assert.ok(offers.expectedItems.every((item) =>
    item.basis === "canonical_detail_entity" || item.basis === "canonical_linked_detail_entity"));
});

test("crawler delegation is bounded and cannot recursively widen the property crawl", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  assert.match(crawler, /const MAX_DELEGATED_OFFER_PAGES = 24;/);
  assert.match(crawler, /delegatedOfferTargets/);
  assert.match(crawler, /absorbPage\(page, false\)/);
  assert.match(crawler, /deriveHotelPageInventoryHintsV2/);
  assert.match(crawler, /isHotelPropertyPageUrlInScopeV2\(normalized, propertyScope\)\) continue/);
  assert.match(crawler, /kind: "direct_content_link"/);
});

test("Offers authority hardening remains hotel-agnostic", async () => {
  const files = await Promise.all([
    readProjectFile("lib/server/hotel-scanner-v2-crawler.ts"),
    readProjectFile("lib/server/hotel-scanner-v2-site-map.mjs"),
    readProjectFile("lib/server/hotel-scanner-v2-landing-inventory.mjs"),
    readProjectFile("lib/server/hotel-scanner-v2-inventory.mjs"),
    readProjectFile("lib/server/hotel-scanner-v2-canonical-registry.mjs"),
  ]);
  assert.doesNotMatch(files.join("\n"), /kirmanpremium|arycanda|evrika/iu);
});


test("durable browser enrichment can reveal a same-origin offer detail outside the property root without widening recursively", async () => {
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  assert.match(rendered, /renderedOfferDelegationTargets/);
  assert.match(rendered, /isHotelPropertyPageUrlInScopeV2\(target, propertyScope\)/);
  assert.match(rendered, /parsed\.origin !== new URL\(page\.url\)\.origin/);
  assert.match(rendered, /kind: "direct_content_link"/);
  assert.match(rendered, /MAX_RENDER_DISCOVERED_OFFER_DETAILS = 24/);
  assert.doesNotMatch(rendered, /kirmanpremium|arycanda|evrika/iu);
});
