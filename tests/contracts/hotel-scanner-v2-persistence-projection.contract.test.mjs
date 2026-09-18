import test from "node:test";
import assert from "node:assert/strict";

import {
  compactHotelScannerResultForPersistenceV2,
  shouldCompactHotelScannerResultForPersistenceV2,
} from "../../lib/server/hotel-scanner-v2-persistence-projection.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function resource(url, overrides = {}) {
  return {
    url,
    resourceType: "page",
    discoveredBy: [],
    sourceUrls: [],
    languages: ["en"],
    crawled: false,
    canonicalTarget: "",
    title: "",
    description: "",
    classification: { primaryType: "other", types: ["other"], confidence: 0.1, signals: [] },
    inventoryHint: null,
    inventoryHints: [],
    variantGroupId: url.replace(/^https?:\/\//u, ""),
    ...overrides,
  };
}

function resultWithResources(count) {
  const resources = Array.from({ length: count }, (_, index) =>
    resource(`https://hotel.test/noise-${index}`));
  resources[0] = resource("https://hotel.test/", { crawled: true });
  resources[1] = resource("https://hotel.test/rooms", { crawled: true });
  resources[2] = resource("https://hotel.test/services");
  resources[3] = resource("https://hotel.test/files/facts.pdf", { resourceType: "pdf" });

  return {
    discovery: {
      siteMap: {
        schemaVersion: "hotel-site-map-v2",
        canonicalUrl: "https://hotel.test/",
        resources,
        relations: [
          { kind: "internal_link", fromUrl: "https://hotel.test/", toUrl: "https://hotel.test/noise-50" },
          { kind: "document_link", fromUrl: "https://hotel.test/", toUrl: "https://hotel.test/files/facts.pdf" },
        ],
        counts: {
          resources: count,
          pages: count - 1,
          documents: 1,
          crawledPages: 2,
          languageVariantGroups: 0,
        },
      },
      inventory: {
        domains: [{
          domain: "services",
          expectedItems: [{
            url: "https://hotel.test/services",
            urls: ["https://hotel.test/services"],
          }],
          landingUrls: ["https://hotel.test/services"],
          detailUrls: [],
          supportingUrls: [],
        }],
        documents: [{ url: "https://hotel.test/files/facts.pdf" }],
      },
      coverage: {
        discoveredRelevantUrls: ["https://hotel.test/services"],
        fetchedRelevantUrls: ["https://hotel.test/rooms"],
        pendingRelevantUrls: [],
        failedRelevantUrls: [],
      },
      failedPageUrls: [],
    },
    intelligenceCandidate: {
      provenance: {
        pageUrls: ["https://hotel.test/", "https://hotel.test/rooms"],
        documentUrls: ["https://hotel.test/files/facts.pdf"],
      },
      facts: [{
        sourceUrls: ["https://hotel.test/services"],
      }],
      conflicts: [],
    },
  };
}

test("small Scanner V2 results are not projected", () => {
  const input = resultWithResources(12);
  assert.equal(shouldCompactHotelScannerResultForPersistenceV2(input), false);
  assert.equal(compactHotelScannerResultForPersistenceV2(input), input);
});

test("large Scanner V2 persistence keeps review evidence and drops irrelevant crawl noise", () => {
  const input = resultWithResources(700);
  assert.equal(shouldCompactHotelScannerResultForPersistenceV2(input), true);

  const projected = compactHotelScannerResultForPersistenceV2(input);
  const urls = projected.discovery.siteMap.resources.map((item) => item.url);

  assert.ok(urls.includes("https://hotel.test/"));
  assert.ok(urls.includes("https://hotel.test/rooms"));
  assert.ok(urls.includes("https://hotel.test/services"));
  assert.ok(urls.includes("https://hotel.test/files/facts.pdf"));
  assert.ok(!urls.includes("https://hotel.test/noise-50"));
  assert.ok(projected.discovery.siteMap.resources.length < 20);

  assert.deepEqual(projected.discovery.inventory, input.discovery.inventory);
  assert.deepEqual(projected.discovery.coverage, input.discovery.coverage);
  assert.deepEqual(projected.intelligenceCandidate, input.intelligenceCandidate);

  assert.deepEqual(projected.discovery.siteMap.persistenceProjection, {
    version: "hotel-site-map-persistence-v1",
    originalResourceCount: 700,
    retainedResourceCount: projected.discovery.siteMap.resources.length,
    originalRelationCount: 2,
    retainedRelationCount: 1,
  });
});

test("large-site persistence projection is wired before immutable scan envelope preparation", async () => {
  const persistence = await readProjectFile("lib/server/hotel-intelligence-persistence-v2.ts");
  assert.match(persistence, /compactHotelScannerResultForPersistenceV2\(input\.result\)/);
  assert.match(persistence, /prepareHotelScanEnvelopeV2\(\{ \.\.\.input, result: persistedResult \}\)/);
});
