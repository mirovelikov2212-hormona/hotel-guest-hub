import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V3 structural engine is hotel-agnostic and independent from AI/domain regexes", async () => {
  const graph = await readProjectFile("lib/server/hotel-scanner-v3-site-graph.mjs");
  const lists = await readProjectFile("lib/server/hotel-scanner-v3-list-detector.mjs");
  const families = await readProjectFile("lib/server/hotel-scanner-v3-page-families.mjs");
  const inventory = await readProjectFile("lib/server/hotel-scanner-v3-structural-inventory.mjs");
  const dom = await readProjectFile("lib/server/hotel-scanner-v3-dom-structure.mjs");

  const combined = [graph, lists, families, inventory, dom].join("\n");
  assert.doesNotMatch(combined, /edelweiss|bahia|kirman|pavel|grand resort/iu);
  assert.doesNotMatch(combined, /OpenAI|openai\.responses|chat\.completions|normalizeHotelScanWithOpenAi/iu);
  assert.doesNotMatch(combined, /accommodation|gastronomy|restaurant|spa|wellness|room[_ -]?detail/iu);

  assert.match(graph, /hotel-scanner-v3-site-graph-1/);
  assert.match(lists, /content_block_link_cluster/);
  assert.match(families, /CONTENT_LIST/);
  assert.match(inventory, /hotel-scanner-v3-structural-inventory-1/);
  assert.match(inventory, /duplicateLabelsAcrossFamilies/);
  assert.match(inventory, /unresolvedMembers/);
  assert.match(dom, /templateFingerprint/);
  assert.match(dom, /repeated_dom_siblings/);
  assert.match(dom, /sha256/);
});

test("Scanner V3 keeps family-scoped identity instead of global label dedupe", async () => {
  const families = await readProjectFile("lib/server/hotel-scanner-v3-page-families.mjs");
  assert.match(families, /identityKey/);
  assert.match(families, /family\.id/);
  assert.doesNotMatch(families, /new Set\([^\n]*label/);
});


test("Scanner V3 DOM evidence is attached to both HTTP and rendered crawl paths", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const lists = await readProjectFile("lib/server/hotel-scanner-v3-list-detector.mjs");

  assert.match(crawler, /extractHotelDomStructureV3/);
  assert.match(crawler, /v3Structure/);
  assert.match(rendered, /richerV3Structure/);
  assert.match(rendered, /renderedV3Structure/);
  assert.match(lists, /repeated_dom_siblings/);
  assert.match(lists, /page\?\.v3Structure\?\.repeatedStructures/);
});
