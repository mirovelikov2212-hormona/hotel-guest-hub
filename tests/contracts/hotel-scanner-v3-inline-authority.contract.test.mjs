import assert from "node:assert/strict";
import test from "node:test";

import { extractHotelDomStructureV3 } from "../../lib/server/hotel-scanner-v3-dom-structure.mjs";
import { buildHotelScannerAdaptivePlanV3 } from "../../lib/server/hotel-scanner-v3-frontier.mjs";
import { buildHotelInventorySnapshotV3 } from "../../lib/server/hotel-scanner-v3-canonical-inventory.mjs";
import { classifyHotelStructuralFamilyV3 } from "../../lib/server/hotel-scanner-v3-ontology.mjs";
import { buildHotelStructuralInventoryGraphV3 } from "../../lib/server/hotel-scanner-v3-structural-inventory.mjs";

function page(url, title, html = "", extra = {}) {
  const v3Structure = html ? extractHotelDomStructureV3(html, url) : undefined;
  return {
    url,
    title,
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
    v3Structure,
    contactSignals: { phones: [], emails: [], addresses: [] },
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
    ...extra,
  };
}

function evidence(pages) {
  return {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages,
    discovery: {
      sitemapPageUrls: [],
      internalLinkUrls: [],
      navigationUrls: [],
    },
  };
}

test("M7 inline repeated cards become structural entities without requiring detail URLs", () => {
  const url = "https://hotel.test/services/";
  const html = `<main><section>
    <article><h3>Wi-Fi</h3><p>Free connection</p></article>
    <article><h3>Parking</h3><p>Guest parking</p></article>
    <article><h3>Concierge</h3><p>Guest assistance</p></article>
    <article><h3>Childcare</h3><p>Family support</p></article>
  </section></main>`;

  const discovery = evidence([page(url, "Hotel Services", html)]);
  const plan = buildHotelScannerAdaptivePlanV3(discovery, { batchLimit: 8 });
  assert.equal(plan.closure.totalFamilies, 1);
  assert.equal(plan.closure.states[0].status, "CLOSED_INLINE");
  assert.equal(plan.closure.states[0].mode, "INLINE_TERMINAL");

  discovery.discovery.structuralCrawl = {
    inventoryClosed: true,
    safetyCapReached: false,
    familyStates: plan.closure.states,
  };

  const snapshot = buildHotelInventorySnapshotV3(discovery, {
    generatedAt: "2026-09-21T00:00:00.000Z",
  });
  const services = snapshot.domains.find((item) => item.domain === "services");

  assert.equal(snapshot.status, "READY");
  assert.equal(services.count, 4);
  assert.ok(snapshot.entities.every((entity) => entity.memberMode === "inline"));
  assert.deepEqual(
    snapshot.entities.map((entity) => entity.label).sort(),
    ["Childcare", "Concierge", "Parking", "Wi-Fi"].sort(),
  );
});

test("M7 open structural families cannot contribute authoritative entity counts", () => {
  const root = "https://hotel.test/stay/";
  const links = [
    "https://hotel.test/stay/area-a/",
    "https://hotel.test/stay/area-b/",
    "https://hotel.test/stay/area-c/",
  ];
  const html = `<main><section>
    ${links.map((href, index) => `<article><a href="${href}"><h3>Area ${index + 1}</h3></a></article>`).join("")}
  </section></main>`;

  const discovery = evidence([page(root, "Accommodation", html)]);
  const plan = buildHotelScannerAdaptivePlanV3(discovery, { batchLimit: 2 });
  assert.equal(plan.closure.states[0].status, "OPEN_SAMPLE");

  discovery.discovery.structuralCrawl = {
    inventoryClosed: false,
    safetyCapReached: false,
    familyStates: plan.closure.states,
  };

  const snapshot = buildHotelInventorySnapshotV3(discovery, {
    generatedAt: "2026-09-21T00:00:00.000Z",
  });

  assert.equal(snapshot.status, "STRUCTURAL_PARTIAL");
  assert.equal(snapshot.counts.structuralEntities, 0);
  assert.equal(snapshot.counts.uncertifiedFamilies, 1);
  assert.ok(snapshot.domains.every((domain) => domain.count === 0));
});

test("M7 collection authority keeps an offers family as offers even when detail copy sounds experiential", () => {
  const sourceUrl = "https://hotel.test/offers/";
  const family = {
    id: "family:test:offers",
    sourceUrl,
    sourceTitle: "Offers",
    heading: "Special Offers",
    sectionPath: ["Offers"],
    confidence: 0.95,
    members: [
      { url: "https://hotel.test/offers/mountain-moments/", label: "Mountain Moments" },
      { url: "https://hotel.test/offers/family-moments/", label: "Family Moments" },
      { url: "https://hotel.test/offers/gourmet-moments/", label: "Gourmet Moments" },
    ],
  };
  const result = classifyHotelStructuralFamilyV3(family, evidence([
    page(sourceUrl, "Special Offers"),
    page(family.members[0].url, "Experience the mountains", "", {
      description: "Experiences and activities for unforgettable moments",
    }),
    page(family.members[1].url, "Family Experiences", "", {
      description: "Activities for the whole family",
    }),
    page(family.members[2].url, "Gourmet Experience", "", {
      description: "A culinary experience",
    }),
  ]));

  assert.equal(result.domain, "offers");
  assert.equal(result.status, "CLASSIFIED");
  assert.equal(result.structuralAuthorityLocked, true);
  assert.equal(result.authoritySource, "COLLECTION_STRUCTURE");
});

test("M7 inline list echoes with the same labels collapse to one structural family", () => {
  const url = "https://hotel.test/spa/";
  const html = `<main>
    <section>
      <div class="card"><div><h3>Infinity Pool</h3></div></div>
      <div class="card"><div><h3>Family Pool</h3></div></div>
      <div class="card"><div><h3>Panorama Sauna</h3></div></div>
    </section>
  </main>`;
  const discovery = evidence([page(url, "Spa & Wellness", html)]);
  const structural = buildHotelStructuralInventoryGraphV3(discovery);

  assert.equal(structural.families.length, 1);
  assert.equal(structural.families[0].members.length, 3);
});


test("M8 plain list items become inline structural entities", () => {
  const url = "https://hotel.test/spa/";
  const html = `<main><section><h2>Pools</h2><ul>
    <li>Infinity Pool</li>
    <li>Sportpool</li>
    <li>Family Whirlpool</li>
    <li>Babyschwimmbad</li>
  </ul></section></main>`;

  const discovery = evidence([page(url, "Spa & Wellness", html)]);
  const plan = buildHotelScannerAdaptivePlanV3(discovery, { batchLimit: 8 });
  assert.equal(plan.closure.states[0].status, "CLOSED_INLINE");
  assert.equal(plan.closure.states[0].totalMembers, 4);
});

test("M8 deterministic service assertions supplement structural services without URL cards", () => {
  const discovery = evidence([
    page("https://hotel.test/facts/", "Important information", "", {
      text: "Free WLAN. Parking in our garage with EV charging. Childcare is available. Ski rental and Ski Depot are offered. Concierge service is available at reception.",
    }),
  ]);
  discovery.discovery.structuralCrawl = {
    inventoryClosed: true,
    safetyCapReached: false,
    familyStates: [],
  };

  const snapshot = buildHotelInventorySnapshotV3(discovery, {
    generatedAt: "2026-09-21T00:00:00.000Z",
  });
  const services = snapshot.domains.find((item) => item.domain === "services");
  const labels = snapshot.entities
    .filter((entity) => entity.domain === "services")
    .map((entity) => entity.label);

  assert.ok(services.count >= 7);
  for (const expected of ["Wi-Fi", "Parking", "EV Charging", "Childcare", "Ski Rental", "Ski Depot", "Concierge"]) {
    assert.ok(labels.includes(expected), `missing service assertion: ${expected}`);
  }
});
