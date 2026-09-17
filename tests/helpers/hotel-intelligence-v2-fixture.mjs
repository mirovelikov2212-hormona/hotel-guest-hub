import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";

export function fixture() {
  const source = { requestedUrl: "https://hotel.test/", canonicalUrl: "https://hotel.test/", scannedAt: "2026-09-16T12:00:00.000Z" };
  const inventory = { schemaVersion: "hotel-inventory-v2", domains: [{ domain: "accommodation", expectationState: "DETERMINISTIC", expectedCount: 1,
    expectedItems: [{ id: "room-1", domain: "accommodation", entityType: "room_type", variantGroupId: "rooms", nameHint: "Garden Room", url: "https://hotel.test/rooms", urls: ["https://hotel.test/rooms"], languages: ["en"], crawled: true, basis: "canonical_detail_entity" }], landingUrls: [], detailUrls: ["https://hotel.test/rooms"], supportingUrls: [], issues: [], evidence: { detailCount: 1, landingExpectedCount: 1, landingIdentifiedCount: 1, observedLandingCounts: [1] } }],
    documents: [{ url: "https://hotel.test/menu.pdf", variantGroupId: "menu", domains: ["gastronomy"], ingestionStatus: "INGESTED" }],
    counts: { deterministicDomains: 1, conflictingDomains: 0, unknownExpectationDomains: 0, expectedItems: 1, pendingDocuments: 0 } };
  const facts = [{ category: "identity", attribute: "name", value: "Fixture Hotel", sourceUrls: [source.canonicalUrl], verification: { status: "VERIFIED", independentSourceCount: 2 } }];
  facts.push({ category: "accommodation", subject: "Garden Room", attribute: "size", label: "Area", value: "30 m²", sourceUrls: ["https://hotel.test/rooms"], verification: { status: "VERIFIED", independentSourceCount: 2, sourceUrls: ["https://hotel.test/rooms", "https://hotel.test/menu.pdf"] } });
  const completeness = buildHotelCompletenessV2({ inventory, profile: { facts }, conflicts: [] });
  const candidate = { schemaVersion: "hotel-intelligence-candidate-v2", generatedAt: source.scannedAt, source, inventory, facts, conflicts: [], completeness,
    provenance: { pageUrls: [source.canonicalUrl, "https://hotel.test/rooms"], documentUrls: ["https://hotel.test/menu.pdf"], crawlerVersion: "production-hotel-intake-v2", extractionVersion: "domain-extractors-v2", verificationVersion: "hotel-scan-verification-v2" },
    validation: { status: "READY_FOR_APPROVAL", downstreamHandoffAllowed: false, blockingReasons: [] } };
  return { schemaVersion: "hotel-intake-pipeline-v2", stage: "VALIDATION_COMPLETE", pipelineStatus: "READY_FOR_APPROVAL", source,
    discovery: { inventory, siteMap: {}, coverage: { coverageComplete: true, failedRelevantCount: 0 }, failedPageUrls: [], crawlPolicy: {} },
    extraction: { facts, issues: [] }, documents: { schemaVersion: "hotel-document-ingestion-v2", documents: [{url: "https://hotel.test/menu.pdf",status:"INGESTED",domains:["gastronomy"],facts:[],byteCount:1024,latencyMs:2}], facts: [], diagnostics: { model: "fixture" } }, verification: {}, completeness,
    intelligenceCandidate: candidate, reviewSections: [], approvedHotelIntelligence: null,
    validationGate: { downstreamHandoffAllowed: false, approvalEligible: true, blockingReasons: [] }, diagnostics: { totalLatencyMs: 12 },
    futureNativeField: { retained: ["a", "b"] } };
}
