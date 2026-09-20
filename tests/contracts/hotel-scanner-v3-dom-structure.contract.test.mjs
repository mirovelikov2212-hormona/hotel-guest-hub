import assert from "node:assert/strict";
import test from "node:test";

import { extractHotelDomStructureV3 } from "../../lib/server/hotel-scanner-v3-dom-structure.mjs";
import { buildHotelStructuralInventoryGraphV3 } from "../../lib/server/hotel-scanner-v3-structural-inventory.mjs";

function card(href, title, description = "") {
  return `<article class="card"><a href="${href}"><figure><img src="/image.jpg" alt=""></figure><div><h3>${title}</h3><p>${description}</p></div></a></article>`;
}

function pageEvidence(url, html, extra = {}) {
  const structure = extractHotelDomStructureV3(html, url);
  return {
    url,
    title: "Fixture",
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
    v3Structure: structure,
    contactSignals: { phones: [], emails: [], addresses: [] },
    delegatedOfferDetailUrls: [],
    delegatedAuthority: null,
    ...extra,
  };
}

test("M2 detects repeated raw-DOM cards without semantic headings", () => {
  const url = "https://hotel.test/catalog/";
  const html = `
    <html><body>
      <header><a href="/noise-a/">Noise A</a><a href="/noise-b/">Noise B</a></header>
      <main>
        <section class="grid">
          ${card("/catalog/a/", "Alpha", "First description")}
          ${card("/catalog/b/", "Bravo", "Second description")}
          ${card("/catalog/c/", "Charlie", "Third description")}
          ${card("/catalog/d/", "Delta", "Fourth description")}
        </section>
      </main>
      <footer><a href="/privacy/">Privacy</a><a href="/legal/">Legal</a></footer>
    </body></html>`;

  const result = extractHotelDomStructureV3(html, url);
  const group = result.repeatedStructures.find((item) => item.count === 4);

  assert.ok(group);
  assert.equal(group.evidence.source, "repeated_dom_siblings");
  assert.deepEqual(group.items.map((item) => item.label), ["Alpha", "Bravo", "Charlie", "Delta"]);
  assert.deepEqual(group.items.map((item) => item.url), [
    "https://hotel.test/catalog/a",
    "https://hotel.test/catalog/b",
    "https://hotel.test/catalog/c",
    "https://hotel.test/catalog/d",
  ]);
  assert.ok(!result.repeatedStructures.some((item) => item.items.some((member) => /privacy|legal|noise-/u.test(member.url))));
});

test("M2 template fingerprint ignores text and URL values but changes with layout shape", () => {
  const first = extractHotelDomStructureV3(`
    <main><section>
      ${card("/a/", "Alpha", "One")}
      ${card("/b/", "Bravo", "Two")}
    </section></main>`, "https://hotel.test/");

  const second = extractHotelDomStructureV3(`
    <main><section>
      ${card("/x/", "Completely Different", "Changed copy")}
      ${card("/y/", "Another Name", "Different copy")}
    </section></main>`, "https://hotel.test/");

  const changedLayout = extractHotelDomStructureV3(`
    <main><section>
      <article><a href="/x/"><h3>One</h3></a></article>
      <article><a href="/y/"><h3>Two</h3></a></article>
    </section></main>`, "https://hotel.test/");

  assert.equal(first.templateFingerprint, second.templateFingerprint);
  assert.notEqual(first.templateFingerprint, changedLayout.templateFingerprint);
});

test("M2 structural inventory consumes DOM lists even when contentBlocks are empty", () => {
  const sourceUrl = "https://hotel.test/collection/";
  const detailUrls = ["one", "two", "three", "four"].map((slug) => `${sourceUrl}${slug}/`);
  const sourceHtml = `<main><div class="cards">${detailUrls.map((url, index) =>
    card(url, `Item ${index + 1}`, `Description ${index + 1}`)).join("")}</div></main>`;

  const pages = [
    pageEvidence(sourceUrl, sourceHtml),
    ...detailUrls.map((url, index) => pageEvidence(url, `<main><article><h1>Item ${index + 1}</h1><p>Detail</p></article></main>`)),
  ];

  const evidence = {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    pages,
    discovery: { sitemapPageUrls: [], internalLinkUrls: [], navigationUrls: [] },
  };

  const inventory = buildHotelStructuralInventoryGraphV3(evidence);
  assert.equal(inventory.counts.leafEntities, 4);
  assert.equal(inventory.families.length, 1);
  assert.equal(inventory.families[0].members.length, 4);
  assert.equal(inventory.structuralLists[0].evidence.source, "repeated_dom_siblings");
});

test("M2 keeps independent repeated structures as separate families", () => {
  const url = "https://hotel.test/hub/";
  const first = Array.from({ length: 5 }, (_, index) => card(`/family-a/item-${index + 1}/`, `A ${index + 1}`)).join("");
  const second = Array.from({ length: 7 }, (_, index) => card(`/family-b/item-${index + 1}/`, `B ${index + 1}`)).join("");
  const html = `<main><section>${first}</section><section>${second}</section></main>`;

  const result = extractHotelDomStructureV3(html, url);
  const counts = result.repeatedStructures.map((item) => item.count).sort((a, b) => a - b);

  assert.ok(counts.includes(5));
  assert.ok(counts.includes(7));
});
