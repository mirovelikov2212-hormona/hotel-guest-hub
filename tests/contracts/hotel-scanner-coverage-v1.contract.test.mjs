import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelScanCoverage } from "../../lib/ai/hotel-scanner-coverage.mjs";

function profile() {
  return {
    identity: { hotelName: "Fixture Resort", address: "", city: "", country: "", bookingUrl: "" },
    contacts: { phones: [], emails: [], socialLinks: [] },
    operations: { checkIn: "", checkOut: "" },
    hospitality: { roomTypes: [], policies: [], venues: [], spaServices: [], amenities: [] },
    brand: { colors: [], fonts: [], logoUrls: [] },
    facts: [],
    uncertainties: [],
  };
}

function evidence(pages) {
  return {
    requestedUrl: "https://hotel.test/",
    canonicalUrl: "https://hotel.test/",
    scannedAt: "2026-09-07T12:00:00.000Z",
    pages,
    brand: { stylesheetUrls: [], colors: [], fonts: [] },
  };
}

function page(url, links = [], title = "") {
  return { url, title, description: "", text: "", links, imageUrls: [], colors: [] };
}

function domain(result, key) {
  return result.domains.find((entry) => entry.domain === key);
}

test("skipped check-in and policy pages are NOT_CRAWLED rather than falsely missing", () => {
  const result = buildHotelScanCoverage({
    profile: profile(),
    evidence: evidence([
      page("https://hotel.test/", [
        "https://hotel.test/hotel-information",
        "https://hotel.test/policies",
        "https://hotel.test/rooms",
      ], "Fixture Resort"),
      page("https://hotel.test/rooms", [], "Rooms"),
    ]),
  });

  assert.equal(domain(result, "check_in_out")?.state, "NOT_CRAWLED");
  assert.equal(domain(result, "policies")?.state, "NOT_CRAWLED");
  assert.deepEqual(domain(result, "check_in_out")?.notCrawledCandidateUrls, ["https://hotel.test/hotel-information"]);
  assert.deepEqual(domain(result, "policies")?.notCrawledCandidateUrls, ["https://hotel.test/policies"]);
});

test("a crawled domain page with no supported discovery is NOT_DISCOVERED", () => {
  const result = buildHotelScanCoverage({
    profile: profile(),
    evidence: evidence([
      page("https://hotel.test/", ["https://hotel.test/policies"], "Fixture Resort"),
      page("https://hotel.test/policies", [], "Policies"),
    ]),
  });

  assert.equal(domain(result, "policies")?.state, "NOT_DISCOVERED");
});

test("check-in/out coverage is PARTIAL until both operational facts are present", () => {
  const inputProfile = profile();
  inputProfile.operations.checkIn = "15:00";
  inputProfile.facts = [{
    category: "operations",
    label: "Check-in",
    value: "15:00",
    confidence: 1,
    sourceUrls: ["https://hotel.test/info"],
  }];

  const result = buildHotelScanCoverage({
    profile: inputProfile,
    evidence: evidence([page("https://hotel.test/info", [], "Hotel information")]),
  });

  assert.equal(domain(result, "check_in_out")?.state, "PARTIAL");
  assert.equal(domain(result, "check_in_out")?.reviewRequired, true);
});

test("invalid and conflict states outrank generic discovery", () => {
  const inputProfile = profile();
  inputProfile.identity.address = "Valid address 1";
  inputProfile.facts = [{
    category: "location",
    label: "Address",
    value: "Valid address 1",
    confidence: 1,
    sourceUrls: ["https://hotel.test/contact"],
  }];

  const invalidResult = buildHotelScanCoverage({
    profile: inputProfile,
    evidence: evidence([page("https://hotel.test/contact", [], "Contact")]),
    invalidValues: [{ field: "identity.address", category: "location", label: "Address" }],
  });
  assert.equal(domain(invalidResult, "location")?.state, "INVALID");

  const conflictResult = buildHotelScanCoverage({
    profile: inputProfile,
    evidence: evidence([page("https://hotel.test/contact", [], "Contact")]),
    conflicts: [{ topic: "address", field: "identity.address" }],
  });
  assert.equal(domain(conflictResult, "location")?.state, "CONFLICT");
});
