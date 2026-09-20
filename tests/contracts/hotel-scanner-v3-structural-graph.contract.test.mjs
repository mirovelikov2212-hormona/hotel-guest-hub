import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelStructuralInventoryGraphV3 } from "../../lib/server/hotel-scanner-v3-structural-inventory.mjs";

function page(url, title, blocks = [], extra = {}) {
  const contentLinks = blocks.flatMap((block) => (block.linkItems || []).map((item) => new URL(item.href, url).toString()));
  return {
    url,
    title,
    description: "",
    text: "",
    links: contentLinks,
    contentLinks,
    navigationLinks: [],
    documentUrls: [],
    canonicalHint: "",
    language: "en",
    languageAlternates: [],
    headings: blocks.map((block) => ({ level: 2, text: block.heading })),
    jsonLdEntities: [],
    contentBlocks: blocks,
    contactSignals: { phones: [], emails: [], addresses: [] },
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
    ...extra,
  };
}

function listBlock(heading, sourceUrl, items) {
  return {
    level: 2,
    heading,
    text: "",
    links: items.map((item) => new URL(item.href, sourceUrl).toString()),
    linkItems: items,
    sectionPath: [],
  };
}

function detailPages(base, items) {
  return items.map((item) => page(new URL(item.href, base).toString(), item.text));
}

test("V3 structural inventory preserves nested accommodation families and duplicate names", () => {
  const root = "https://hotel.test/accommodation/";
  const main = "https://hotel.test/accommodation/main/";
  const club = "https://hotel.test/accommodation/club/";
  const villas = "https://hotel.test/accommodation/villas/";

  const mainRooms = [
    ["suite-imelda", "Suite Imelda"],
    ["presidential-suite", "Presidential Suite"],
    ["suites", "Suites"],
    ["junior-suites", "Junior Suites"],
    ["deluxe-rooms", "Deluxe Rooms"],
  ].map(([slug, text]) => ({ href: `${main}${slug}/`, text }));

  const clubRooms = [
    ["royal-suite", "Royal Suite"],
    ["presidential-suite", "Presidential Suite"],
    ["suites", "Suites"],
    ["junior-suites", "Junior Suites"],
    ["double-room", "Double Room"],
  ].map(([slug, text]) => ({ href: `${club}${slug}/`, text }));

  const villaRooms = [
    ["mimosas", "Villa Las Mimosas"],
    ["retamas", "Villa Las Retamas"],
    ["palmeras", "Villa Las Palmeras"],
  ].map(([slug, text]) => ({ href: `${villas}${slug}/`, text }));

  const evidence = {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages: [
      page(root, "Accommodation", [
        listBlock("Stay areas", root, [
          { href: main, text: "Main Hotel" },
          { href: club, text: "Club House" },
          { href: villas, text: "Villas" },
        ]),
      ]),
      page(main, "Main Hotel", [listBlock("Rooms", main, mainRooms)]),
      page(club, "Club House", [listBlock("Rooms", club, clubRooms)]),
      page(villas, "Villas", [listBlock("Villas", villas, villaRooms)]),
      ...detailPages(main, mainRooms),
      ...detailPages(club, clubRooms),
      ...detailPages(villas, villaRooms),
    ],
    discovery: { sitemapPageUrls: [], internalLinkUrls: [], navigationUrls: [] },
  };

  const graph = buildHotelStructuralInventoryGraphV3(evidence);
  assert.equal(graph.families.length, 4);
  assert.equal(graph.leafMembers.length, 13);
  assert.equal(graph.counts.duplicateLabelsAcrossFamilies, 3);
  assert.equal(graph.closure.unresolvedMembers, 0);

  const presidential = graph.leafMembers.filter((item) => item.label === "Presidential Suite");
  assert.equal(presidential.length, 2);
  assert.notEqual(presidential[0].identityKey, presidential[1].identityKey);
  assert.notEqual(presidential[0].familyId, presidential[1].familyId);
});

test("V3 structural inventory unions independent gastronomy list families without domain-specific selectors", () => {
  const root = "https://hotel.test/gastronomy/";
  const restaurants = "https://hotel.test/gastronomy/restaurants/";
  const bars = "https://hotel.test/gastronomy/bars/";

  const restaurantItems = Array.from({ length: 10 }, (_, index) => ({
    href: `${restaurants}venue-${index + 1}/`,
    text: `Restaurant ${index + 1}`,
  }));
  const barItems = Array.from({ length: 13 }, (_, index) => ({
    href: `${bars}venue-${index + 1}/`,
    text: `Bar ${index + 1}`,
  }));

  const evidence = {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages: [
      page(root, "Gastronomy", [listBlock("Gastronomy areas", root, [
        { href: restaurants, text: "Restaurants" },
        { href: bars, text: "Bars and lounges" },
      ])]),
      page(restaurants, "Restaurants", [listBlock("Restaurants", restaurants, restaurantItems)]),
      page(bars, "Bars", [listBlock("Bars and lounges", bars, barItems)]),
      ...detailPages(restaurants, restaurantItems),
      ...detailPages(bars, barItems),
    ],
    discovery: { sitemapPageUrls: [], internalLinkUrls: [], navigationUrls: [] },
  };

  const graph = buildHotelStructuralInventoryGraphV3(evidence);
  assert.equal(graph.leafMembers.length, 23);
  assert.equal(graph.families.length, 3);
  assert.equal(graph.closure.openFamilies, 0);
});

test("V3 structural inventory handles one flat authority list without hotel-specific knowledge", () => {
  const listUrl = "https://hotel.test/stay/";
  const rooms = Array.from({ length: 19 }, (_, index) => ({
    href: `${listUrl}room-${index + 1}/`,
    text: `Room Type ${index + 1}`,
  }));
  const evidence = {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages: [
      page(listUrl, "Rooms", [listBlock("Rooms and Suites", listUrl, rooms)]),
      ...detailPages(listUrl, rooms),
    ],
    discovery: { sitemapPageUrls: [], internalLinkUrls: [], navigationUrls: [] },
  };

  const graph = buildHotelStructuralInventoryGraphV3(evidence);
  assert.equal(graph.families.length, 1);
  assert.equal(graph.leafMembers.length, 19);
  assert.equal(graph.closure.closedFamilies, 1);
});

test("V3 roles distinguish navigation/list/detail structure without hotel ontology", () => {
  const root = "https://hotel.test/stay/";
  const group = "https://hotel.test/stay/collection/";
  const items = [
    { href: `${group}one/`, text: "One" },
    { href: `${group}two/`, text: "Two" },
  ];
  const evidence = {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages: [
      page(root, "Stay", [listBlock("Collections", root, [{ href: group, text: "Collection" }, { href: "https://hotel.test/stay/other/", text: "Other" }])]),
      page(group, "Collection", [listBlock("Items", group, items)]),
      ...detailPages(group, items),
    ],
    discovery: { sitemapPageUrls: [], internalLinkUrls: [], navigationUrls: [] },
  };

  const graph = buildHotelStructuralInventoryGraphV3(evidence);
  const roles = new Map(graph.roles.map((item) => [item.url, item.role]));
  assert.equal(roles.get(group), "HYBRID");
  assert.equal(roles.get(`${group}one/`), "DETAIL");
});
