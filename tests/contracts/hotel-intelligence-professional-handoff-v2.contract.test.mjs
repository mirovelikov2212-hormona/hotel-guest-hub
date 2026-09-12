import assert from "node:assert/strict";
import test from "node:test";

import { professionalizeHotelIntelligencePackage } from "../../lib/product-factory/hotel-intelligence-professionalizer.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function basePackage(facts) {
  return {
    schemaVersion: "hotel-intelligence-v1",
    generatedAt: "2026-09-11T00:00:00.000Z",
    source: { canonicalUrl: "https://hotel.test/" },
    evidenceLayer: { facts, sourceUrls: ["https://hotel.test/"], uncertainties: [] },
    hotelProfileLayer: { identity: { hotelName: "Test Hotel" }, contacts: {}, operations: {}, hospitality: {} },
    designIntelligenceLayer: {
      colors: [], fonts: [], styleKeywords: [], imageReferences: [], logoReferences: [], visualAssetPolicy: "hotel_authorization_required",
    },
    routing: { hub: facts, smartSetup: facts, designStudio: [], review: [] },
    readiness: {
      evidenceFactCount: facts.length,
      hubCandidateCount: facts.length,
      smartSetupCandidateCount: facts.length,
      designSignalCount: 0,
      reviewRequiredCount: 0,
    },
  };
}

function conflictFact(id, value) {
  return {
    id,
    category: "policy",
    subject: "hotel",
    attribute: "pet_policy",
    label: "Домашни любимци",
    value,
    confidence: 0.99,
    sourceUrls: [`https://hotel.test/${id}`],
    verification: { status: "CONFLICT", independentSourceCount: 1, sourceUrls: [`https://hotel.test/${id}`] },
    targets: ["hub", "smart_setup", "review"],
    status: "review_required",
  };
}

test("approved Factory package refuses unresolved conflicting effective values", () => {
  const pkg = basePackage([
    conflictFact("fact-1", "Разрешени са домашни любимци"),
    conflictFact("fact-2", "Домашни любимци не се допускат"),
  ]);
  assert.throws(
    () => professionalizeHotelIntelligencePackage(pkg, { humanReviewResolved: true }),
    /HOTEL_INTELLIGENCE_APPROVED_CONFLICT_UNRESOLVED:policy\|hotel\|pet_policy/,
  );
});

test("approved human-resolved claim keeps entity metadata and becomes Factory-ready", () => {
  const pkg = basePackage([
    conflictFact("fact-1", "Домашни любимци не се допускат"),
  ]);
  const approved = professionalizeHotelIntelligencePackage(pkg, { humanReviewResolved: true });
  assert.equal(approved.readiness.humanReviewResolved, true);
  assert.equal(approved.routing.review.length, 0);
  assert.equal(approved.factoryBlueprint.policies.length, 1);
  assert.equal(approved.factoryBlueprint.policies[0].name, "hotel");
  assert.deepEqual(approved.factoryBlueprint.policies[0].attributes.pet_policy, ["Домашни любимци не се допускат"]);
  assert.equal(approved.factoryBlueprint.policies[0].reviewRequired, false);
});

test("review approval contract preserves subject, attribute and verification metadata", async () => {
  const review = await readProjectFile("lib/product-factory/hotel-intelligence-review.ts");
  assert.match(review, /subject\?: string/);
  assert.match(review, /attribute\?: string/);
  assert.match(review, /verification\?: HotelFactVerificationMetadata/);
  assert.match(review, /professionalizeHotelIntelligencePackage\(basePackage, \{ humanReviewResolved: true \}\)/);
  assert.match(review, /scannerVersion: "hotel-scanner-v2-verification"/);
});

test("immutable Design Studio revision persists the approved source package and Factory verifies it", async () => {
  const revisions = await readProjectFile("lib/server/hub-design-draft-revisions.ts");
  const factoryAuthority = await readProjectFile("lib/server/factory-release-design-authority.ts");

  assert.match(revisions, /sourcePackageJson/);
  assert.match(revisions, /p_source_package: prepared\.sourcePackageJson/);
  assert.match(revisions, /loadApprovedHotelIntelligenceEnvelope/);

  assert.match(factoryAuthority, /source_package_json/);
  assert.match(factoryAuthority, /sourcePackageChecksum/);
  assert.match(factoryAuthority, /sha256\(approved\.intelligencePackage\)/);
  assert.match(factoryAuthority, /sourcePackage,/);
});
