import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelScannerAdaptivePlanV3 } from "../../lib/server/hotel-scanner-v3-frontier.mjs";

function page(url, blocks = [], extra = {}) {
  const contentLinks = blocks.flatMap((block) => (block.linkItems || []).map((item) => new URL(item.href, url).toString()));
  return {
    url,
    title: "Fixture",
    description: "",
    text: "",
    links: contentLinks,
    contentLinks,
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    headings: [],
    jsonLdEntities: [],
    contentBlocks: blocks,
    contactSignals: { phones: [], emails: [], addresses: [] },
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
    ...extra,
  };
}

function block(sourceUrl, heading, items) {
  return {
    level: 2,
    heading,
    text: "",
    links: items.map((item) => new URL(item.href, sourceUrl).toString()),
    linkItems: items,
    sectionPath: [],
  };
}

function evidence(pages, extraDiscovery = {}) {
  return {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages,
    discovery: {
      sitemapPageUrls: [],
      internalLinkUrls: [],
      navigationUrls: [],
      ...extraDiscovery,
    },
  };
}

test("M3 closes a large terminal family from deterministic sibling samples instead of fetching every detail", () => {
  const source = "https://hotel.test/stay/";
  const items = Array.from({ length: 19 }, (_, index) => ({
    href: `${source}item-${index + 1}/`,
    text: `Item ${index + 1}`,
  }));
  const sampledIndexes = [0, 9, 18];

  const plan = buildHotelScannerAdaptivePlanV3(evidence([
    page(source, [block(source, "Collection", items)]),
    ...sampledIndexes.map((index) => page(items[index].href)),
  ]), { batchLimit: 8 });

  assert.equal(plan.hasStructuralInventory, true);
  assert.equal(plan.stopReason, "INVENTORY_CLOSED");
  assert.equal(plan.inventoryClosed, true);
  assert.equal(plan.closure.totalFamilies, 1);
  assert.equal(plan.closure.closedFamilies, 1);
  assert.equal(plan.closure.openFamilies, 0);
  assert.equal(plan.closure.inferredLeafMembers, 16);
  assert.equal(plan.nextBatch.length, 0);

  const state = plan.closure.states[0];
  assert.equal(state.mode, "SAMPLE_TERMINALITY");
  assert.equal(state.status, "CLOSED_INFERRED_LEAF");
  assert.deepEqual(state.sampleIndexes, [0, 9, 18]);
});

test("M3 expands an entire parent family when a sampled member reveals a nested list", () => {
  const root = "https://hotel.test/stay/";
  const areas = [
    { href: "https://hotel.test/stay/area-a/", text: "Area A" },
    { href: "https://hotel.test/stay/area-b/", text: "Area B" },
    { href: "https://hotel.test/stay/area-c/", text: "Area C" },
  ];
  const children = Array.from({ length: 5 }, (_, index) => ({
    href: `https://hotel.test/stay/area-a/item-${index + 1}/`,
    text: `Child ${index + 1}`,
  }));

  const plan = buildHotelScannerAdaptivePlanV3(evidence([
    page(root, [block(root, "Areas", areas)]),
    page(areas[0].href, [block(areas[0].href, "Items", children)]),
  ]), { batchLimit: 2 });

  const rootState = plan.closure.states.find((state) => state.sourceUrl === "https://hotel.test/stay");
  assert.ok(rootState);
  assert.equal(rootState.mode, "EXPAND_ALL");
  assert.equal(rootState.status, "OPEN_EXPANSION");
  assert.equal(rootState.pendingRequiredMembers, 2);

  assert.deepEqual(new Set(plan.nextBatch), new Set([
    "https://hotel.test/stay/area-b",
    "https://hotel.test/stay/area-c",
  ]));
  assert.ok(plan.frontier.familyCandidates.every((candidate) =>
    ["family_expansion", "family_sample"].includes(candidate.reason)));
});

test("M3 recursively samples child families after structural category expansion", () => {
  const root = "https://hotel.test/stay/";
  const areas = ["a", "b", "c"].map((slug) => ({
    href: `https://hotel.test/stay/${slug}/`,
    text: `Area ${slug.toUpperCase()}`,
  }));
  const pages = [page(root, [block(root, "Areas", areas)])];

  for (const area of areas) {
    const children = Array.from({ length: 5 }, (_, index) => ({
      href: `${area.href}item-${index + 1}/`,
      text: `${area.text} Item ${index + 1}`,
    }));
    pages.push(page(area.href, [block(area.href, "Items", children)]));
  }

  const plan = buildHotelScannerAdaptivePlanV3(evidence(pages), { batchLimit: 9 });

  const rootState = plan.closure.states.find((state) => state.sourceUrl === "https://hotel.test/stay");
  assert.equal(rootState?.status, "CLOSED_EXPANDED");

  const childStates = plan.closure.states.filter((state) => state.sourceUrl !== "https://hotel.test/stay");
  assert.equal(childStates.length, 3);
  assert.ok(childStates.every((state) => state.mode === "SAMPLE_TERMINALITY"));
  assert.ok(childStates.every((state) => state.pendingRequiredMembers === 3));
  assert.equal(plan.nextBatch.length, 9);
  assert.ok(plan.frontier.familyCandidates.every((candidate) => candidate.reason === "family_sample"));
});

test("M3 marks unavailable required members as blocked instead of claiming closure", () => {
  const source = "https://hotel.test/list/";
  const items = [
    { href: `${source}a/`, text: "A" },
    { href: `${source}b/`, text: "B" },
  ];

  const plan = buildHotelScannerAdaptivePlanV3(evidence([
    page(source, [block(source, "Items", items)]),
    page(items[0].href),
  ]), {
    unavailableUrls: [items[1].href],
    batchLimit: 4,
  });

  assert.equal(plan.stopReason, "INVENTORY_BLOCKED");
  assert.equal(plan.inventoryClosed, false);
  assert.equal(plan.closure.blockedFamilies, 1);
  assert.equal(plan.closure.states[0].status, "BLOCKED");
});

test("M3 discovery frontier uses navigation and one shallow sitemap representative per structural branch", () => {
  const home = page("https://hotel.test/", [], {
    navigationLinks: [
      "https://hotel.test/stay/",
      "https://hotel.test/dine/",
    ],
  });
  const plan = buildHotelScannerAdaptivePlanV3(evidence([home], {
    navigationUrls: home.navigationLinks,
    sitemapPageUrls: [
      "https://hotel.test/stay/",
      "https://hotel.test/stay/a/",
      "https://hotel.test/stay/b/",
      "https://hotel.test/dine/",
      "https://hotel.test/dine/a/",
      "https://hotel.test/wellbeing/",
      "https://hotel.test/wellbeing/treatments/a/",
    ],
  }), { batchLimit: 8 });

  assert.equal(plan.hasStructuralInventory, false);
  assert.equal(plan.stopReason, "CONTINUE");
  assert.deepEqual(plan.nextBatch.slice(0, 2), [
    "https://hotel.test/dine",
    "https://hotel.test/stay",
  ]);
  assert.ok(plan.nextBatch.includes("https://hotel.test/wellbeing"));
  assert.ok(!plan.nextBatch.includes("https://hotel.test/stay/a"));
  assert.ok(!plan.nextBatch.includes("https://hotel.test/wellbeing/treatments/a"));
});
