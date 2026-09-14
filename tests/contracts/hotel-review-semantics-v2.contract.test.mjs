import assert from "node:assert/strict";
import test from "node:test";

import {
  HOTEL_REVIEW_SEMANTIC_KINDS,
  buildHotelReviewSemanticsV2,
} from "../../lib/ai/hotel-review-semantics-v2.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";
const reviewPath = "lib/product-factory/hotel-intelligence-review.ts";

function fixture() {
  return {
    profile: {
      uncertainties: [
        "Please confirm the late check-out policy with the hotel.",
        "Conflict [Check-in]: 14:00 ↔ 15:00. Human review required.",
      ],
    },
    conflictNotes: ["Conflict [Check-in]: 14:00 ↔ 15:00. Human review required."],
    conflicts: [{
      id: "scanner-conflict:check_in",
      topic: "check_in",
      topicLabel: "Check-in",
      claims: [
        { value: "14:00", sourceUrls: ["https://hotel.test/info"] },
        { value: "15:00", sourceUrls: ["https://hotel.test/terms"] },
      ],
      sourceUrls: ["https://hotel.test/info", "https://hotel.test/terms"],
    }],
    coverage: {
      domains: [
        { domain: "policies", state: "NOT_CRAWLED", scannedUrls: [], notCrawledCandidateUrls: ["https://hotel.test/policies"] },
        { domain: "wellness", state: "PARTIAL", scannedUrls: ["https://hotel.test/spa"], notCrawledCandidateUrls: [] },
        { domain: "dining", state: "DISCOVERED", scannedUrls: ["https://hotel.test/restaurant"], notCrawledCandidateUrls: [] },
        { domain: "contacts", state: "INVALID", scannedUrls: ["https://hotel.test/contact"], notCrawledCandidateUrls: [] },
      ],
    },
    invalidValues: [{
      path: "contacts.emails.0",
      category: "contact",
      label: "Email",
      value: "your@email.com",
      kind: "email",
      reason: "placeholder_email_local_part",
    }],
    reconciliation: {
      issues: [
        {
          kind: "evidence_conflict",
          field: "operations.checkIn",
          evidenceValues: [
            { value: "14:00", sourceUrls: ["https://hotel.test/info"] },
            { value: "15:00", sourceUrls: ["https://hotel.test/terms"] },
          ],
        },
        {
          kind: "profile_evidence_partial",
          field: "hospitality.roomTypes",
          unsupportedProfileValues: ["Legacy Suite"],
          evidenceValues: [{ value: "Deluxe Suite", sourceUrls: ["https://hotel.test/rooms"] }],
        },
      ],
    },
    technologyDiscovery: {
      schemaVersion: "hotel-technology-discovery-v1",
      capabilities: {
        bookingTechnology: { classification: "CONFIRMED PUBLIC EVIDENCE", urls: ["https://booking.vendor.test"] },
        guestAccountPortal: { classification: "NOT PUBLICLY EVIDENCED", urls: [] },
        operationalGuestHub: {
          classification: "NOT PUBLICLY EVIDENCED",
          evidence: [],
          note: "No positive Operational Guest Hub signal was found. This is not a claim that the hotel does not use one.",
        },
        publicWebAppSurface: { classification: "UNKNOWN", manifestUrls: [], serviceWorkerUrls: [] },
      },
    },
    humanReview: {
      items: [
        {
          id: "manual-1",
          origin: "manual",
          category: "policy",
          label: "Pool towel deposit",
          effectiveValue: "20 BGN",
          sourceUrls: [],
          decision: "added",
        },
        {
          id: "corrected-1",
          origin: "scanner",
          category: "operations",
          label: "Check-out",
          scannerValue: "11:00",
          effectiveValue: "12:00",
          sourceUrls: ["https://hotel.test/info"],
          decision: "corrected",
        },
      ],
    },
  };
}

test("Review Semantics V2 exposes the six canonical review kinds as a non-authoritative projection", () => {
  assert.deepEqual(HOTEL_REVIEW_SEMANTIC_KINDS, [
    "conflict",
    "coverage_gap",
    "invalid_value",
    "profile_evidence_mismatch",
    "technology_ambiguity",
    "human_enrichment",
  ]);

  const result = buildHotelReviewSemanticsV2(fixture());
  assert.equal(result.schemaVersion, "hotel-review-semantics-v2");
  assert.deepEqual(result.authority, {
    kind: "review_projection_only",
    persistenceAuthority: false,
    lifecycleReadinessAuthority: false,
    approvalAuthority: false,
  });
});

test("Review Semantics V2 projects existing conflict, coverage, invalid and mismatch engines without duplicating scalar conflicts", () => {
  const result = buildHotelReviewSemanticsV2(fixture());
  assert.equal(result.counts.conflict, 1);
  assert.equal(result.counts.coverage_gap, 2);
  assert.equal(result.counts.invalid_value, 1);
  assert.equal(result.counts.profile_evidence_mismatch, 1);

  const mismatch = result.issues.find((issue) => issue.kind === "profile_evidence_mismatch");
  assert.equal(mismatch?.subject, "hospitality.roomTypes");
  assert.match(mismatch?.detail || "", /Legacy Suite/);
  assert.equal(result.issues.some((issue) => issue.kind === "profile_evidence_mismatch" && issue.subject === "operations.checkIn"), false);
});

test("technology ambiguity preserves absence-safe semantics instead of inventing negative technology claims", () => {
  const result = buildHotelReviewSemanticsV2(fixture());
  const technology = result.issues.filter((issue) => issue.kind === "technology_ambiguity");

  assert.equal(technology.length, 3);
  assert.ok(technology.some((issue) => issue.subject === "operational_guest_hub" && issue.state === "NOT PUBLICLY EVIDENCED"));
  assert.ok(technology.some((issue) => /not a claim/i.test(issue.detail)));
  assert.equal(technology.some((issue) => issue.subject === "booking_technology"), false);
});

test("human enrichment projects unresolved scanner notes plus manual additions/corrections without duplicating conflict notes", () => {
  const result = buildHotelReviewSemanticsV2(fixture());
  const human = result.issues.filter((issue) => issue.kind === "human_enrichment");

  assert.equal(human.length, 3);
  assert.ok(human.some((issue) => issue.state === "NEEDS_HUMAN_INPUT" && /late check-out/i.test(issue.detail)));
  assert.ok(human.some((issue) => issue.state === "HUMAN_ADDED" && issue.subject === "Pool towel deposit"));
  assert.ok(human.some((issue) => issue.state === "HUMAN_CORRECTED" && issue.subject === "Check-out"));
  assert.equal(human.some((issue) => /Conflict \[Check-in\]/i.test(issue.detail)), false);
});

test("Scanner API wires Review Semantics V2 beside existing evidence products without making it readiness or approval authority", async () => {
  const route = await readProjectFile(routePath);
  const review = await readProjectFile(reviewPath);

  assert.match(route, /buildHotelReviewSemanticsV2/);
  assert.match(route, /reviewSemantics,/);
  assert.match(route, /reviewSemanticIssueCount: reviewSemantics\.issues\.length/);
  assert.match(route, /technologyDiscovery,/);
  assert.match(route, /intelligencePackage,/);
  assert.doesNotMatch(route, /buildHotelIntelligencePackage\([^)]*reviewSemantics/);
  assert.doesNotMatch(route, /reviewRequiredCount\s*[:=].*reviewSemantics/i);

  assert.match(review, /"pending"/);
  assert.match(review, /"approved"/);
  assert.match(review, /"rejected"/);
  assert.match(review, /"corrected"/);
  assert.match(review, /"added"/);
});
