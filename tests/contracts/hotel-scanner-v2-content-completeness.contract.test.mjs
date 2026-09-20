import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelCompletenessV2 } from "../../lib/server/hotel-scanner-v2-completeness.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

function item(id, name, url) {
  return {
    id,
    domain: "accommodation",
    entityType: "room_type",
    variantGroupId: id,
    nameHint: name,
    url,
    urls: [url],
    languages: ["en"],
    crawled: true,
    basis: "deterministic_landing_entity",
  };
}

const roomA = item("room:a", "Room A", "https://hotel.test/rooms");
const roomB = item("room:b", "Room B", "https://hotel.test/rooms");

function inventory() {
  return {
    domains: [{
      domain: "accommodation",
      expectationState: "DETERMINISTIC",
      expectedCount: 2,
      expectedItems: [roomA, roomB],
    }],
    documents: [],
  };
}

function identity(name) {
  return {
    category: "accommodation",
    subject: name,
    attribute: "room_type",
    label: "Room type",
    value: name,
    confidence: 1,
    sourceUrls: ["https://hotel.test/rooms"],
  };
}

function detail(name, value) {
  return {
    category: "accommodation",
    subject: name,
    attribute: "description",
    label: "Description",
    value,
    confidence: 0.9,
    sourceUrls: ["https://hotel.test/rooms"],
  };
}

test("entity inventory can be ready while missing details move to onboarding", () => {
  const result = buildHotelCompletenessV2({
    inventory: inventory(),
    profile: { facts: [identity("Room A"), identity("Room B")] },
    conflicts: [],
  });

  const domain = result.domains[0];
  assert.equal(domain.inventory.status, "COMPLETE");
  assert.equal(domain.inventory.extracted, 2);
  assert.equal(domain.content.status, "ONBOARDING_REQUIRED");
  assert.equal(domain.content.detailed, 0);
  assert.equal(domain.content.missingDetailItems.length, 2);
  assert.equal(domain.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
  assert.equal(result.prerequisitesSatisfied, true);
  assert.ok(!result.blockingReasons.includes("domain_content_incomplete"));
  assert.deepEqual(result.onboarding.domains, ["accommodation"]);
});

test("domain becomes complete only after every discovered entity has real detail content", () => {
  const result = buildHotelCompletenessV2({
    inventory: inventory(),
    profile: {
      facts: [
        identity("Room A"),
        identity("Room B"),
        detail("Room A", "24 m², king bed"),
        detail("Room B", "32 m², balcony"),
      ],
    },
    conflicts: [],
  });

  const domain = result.domains[0];
  assert.equal(domain.inventory.status, "COMPLETE");
  assert.equal(domain.content.status, "COMPLETE");
  assert.equal(domain.content.detailed, 2);
  assert.equal(domain.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
  assert.equal(result.prerequisitesSatisfied, true);
});

test("real cross-source conflicts remain visible and block approval after completeness passes", () => {
  const result = buildHotelCompletenessV2({
    inventory: inventory(),
    profile: {
      facts: [
        identity("Room A"),
        identity("Room B"),
        detail("Room A", "24 m², king bed"),
        detail("Room B", "32 m², balcony"),
      ],
    },
    conflicts: [{
      subject: "hotel",
      attribute: "pet_policy",
      claims: [
        { value: "Pets allowed", sourceUrls: ["https://hotel.test/policy"] },
        { value: "Pets not allowed", sourceUrls: ["https://hotel.test/faq"] },
      ],
    }],
  });

  assert.equal(result.status, "READY_FOR_ONBOARDING");
  assert.equal(result.conflicts.unresolved, 1);
  assert.ok(result.blockingReasons.includes("unresolved_cross_source_conflicts"));
  assert.equal(result.prerequisitesSatisfied, false);
});


test("localized detail facts on the same canonical page satisfy content completeness", () => {
  const url = "https://hotel.test/rooms/family-room";
  const detailItem = {
    id: "room:family",
    domain: "accommodation",
    entityType: "room_type",
    variantGroupId: "hotel.test/rooms/family-room",
    nameHint: "Family Room",
    url,
    urls: [url],
    languages: ["en", "bg"],
    crawled: true,
    basis: "canonical_detail_entity",
  };
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "accommodation",
        expectationState: "DETERMINISTIC",
        expectedCount: 1,
        expectedItems: [detailItem],
      }],
      documents: [],
    },
    profile: {
      facts: [
        { category: "accommodation", subject: "Family Room", attribute: "room_type", label: "Room type", value: "Family Room", confidence: 1, sourceUrls: [url] },
        { category: "accommodation", subject: "Фамилна стая", attribute: "capacity", label: "Капацитет", value: "2 възрастни + 2 деца", confidence: 1, sourceUrls: [url] },
        { category: "accommodation", subject: "Фамилна стая", attribute: "description", label: "Описание", value: "Просторно помещение", confidence: 1, sourceUrls: [url] },
      ],
    },
    conflicts: [],
  });

  assert.equal(result.domains[0].inventory.status, "COMPLETE");
  assert.equal(result.domains[0].content.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
});

test("deterministic list-only service existence is complete when the site provides no richer detail page", () => {
  const url = "https://hotel.test/services";
  const serviceItem = {
    id: "service:exchange",
    domain: "services",
    entityType: "service",
    variantGroupId: "hotel.test/services#currency-exchange",
    nameHint: "Currency Exchange",
    url,
    urls: [url],
    languages: ["en"],
    crawled: true,
    basis: "canonical_service_text_entity",
  };
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "services",
        expectationState: "DETERMINISTIC",
        expectedCount: 1,
        expectedItems: [serviceItem],
      }],
      documents: [],
    },
    profile: {
      facts: [{
        category: "services",
        subject: "Currency Exchange",
        attribute: "service",
        label: "Service",
        value: "Currency Exchange",
        confidence: 1,
        sourceUrls: [url],
      }],
    },
    conflicts: [],
  });

  assert.equal(result.domains[0].inventory.status, "COMPLETE");
  assert.equal(result.domains[0].content.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
});


test("deterministic list-only service existence can complete without duplicate AI identity fact", () => {
  const url = "https://hotel.test/services";
  const serviceItem = {
    id: "service:wifi",
    domain: "services",
    entityType: "service",
    variantGroupId: "hotel.test/services#wifi",
    nameHint: "Wi-Fi",
    url,
    urls: [url],
    languages: ["en"],
    crawled: true,
    basis: "canonical_service_text_entity",
  };
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "services",
        expectationState: "DETERMINISTIC",
        expectedCount: 1,
        expectedItems: [serviceItem],
      }],
      documents: [],
    },
    profile: { facts: [] },
    conflicts: [],
  });

  assert.equal(result.domains[0].inventory.status, "COMPLETE");
  assert.equal(result.domains[0].inventory.extracted, 1);
  assert.equal(result.domains[0].content.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
});


test("deterministic water facility text counts as existence evidence", () => {
  const url = "https://hotel.test/pools";
  const pool = {
    id: "experience:main-pool",
    domain: "experiences",
    entityType: "pool",
    variantGroupId: "hotel.test/pools#main-pool",
    nameHint: "Main Pool",
    url,
    urls: [url],
    languages: ["en"],
    crawled: true,
    basis: "canonical_facility_text_entity",
  };
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "experiences",
        expectationState: "DETERMINISTIC",
        expectedCount: 1,
        expectedItems: [pool],
      }],
      documents: [],
    },
    profile: { facts: [] },
    conflicts: [],
  });

  assert.equal(result.domains[0].inventory.status, "COMPLETE");
  assert.equal(result.domains[0].content.status, "COMPLETE");
  assert.equal(result.status, "READY_FOR_ONBOARDING");
});


test("offer detail fallback preserves substantive crawled source content before completeness", async () => {
  const deterministic = await readProjectFile("lib/ai/hotel-scanner-v2-deterministic-facts.ts");
  const extractor = await readProjectFile("lib/ai/hotel-scanner-v2-domain-extractors-safe.ts");
  assert.match(deterministic, /export function buildDeterministicOfferDetailFactsV2/);
  assert.match(deterministic, /attribute: "description"/);
  assert.match(deterministic, /sourceUrls: \[page\.url\]/);
  assert.match(extractor, /buildDeterministicOfferDetailFactsV2\(pages, domainInventory\)/);
});

test("identity-only offer evidence moves to onboarding while a sourced detail description completes it", () => {
  const url = "https://hotel.test/en/exclusive-benefit";
  const item = {
    id: "offers:benefit", domain: "offers", entityType: "offer",
    variantGroupId: "hotel.test/exclusive-benefit", nameHint: "Exclusive Benefit",
    url, urls: [url], languages: ["en"], crawled: true, basis: "canonical_detail_entity",
  };
  const inventory = { domains: [{ domain: "offers", expectationState: "DETERMINISTIC", expectedCount: 1, expectedItems: [item] }], documents: [] };
  const identity = { category: "offers", subject: "Exclusive Benefit", attribute: "offer", label: "Offer", value: "Exclusive Benefit", confidence: 1, sourceUrls: [url] };
  assert.equal(buildHotelCompletenessV2({ inventory, profile: { facts: [identity] }, conflicts: [] }).domains[0].content.status, "ONBOARDING_REQUIRED");
  const description = { category: "offers", subject: "Exclusive Benefit", attribute: "description", label: "Offer detail", value: "A sourced benefit description with booking conditions and included services.", confidence: 0.99, sourceUrls: [url] };
  assert.equal(buildHotelCompletenessV2({ inventory, profile: { facts: [identity, description] }, conflicts: [] }).domains[0].content.status, "COMPLETE");
});


test("group headings on a shared landing surface are content-covered only when multiple concrete siblings have substantive detail", () => {
  const url = "https://hotel.test/experiences/pools";
  const group = {
    id: "experience:pool-group", domain: "experiences", entityType: "experience",
    variantGroupId: "hotel.test/experiences/pools#pool-group", nameHint: "Indoor and outdoor pools",
    url, urls: [url], languages: ["en"], crawled: true, basis: "canonical_section_entity",
  };
  const indoor = {
    ...group, id: "experience:indoor", variantGroupId: "hotel.test/experiences/pools#indoor",
    nameHint: "Indoor mineral pool", basis: "canonical_structural_entity",
  };
  const outdoor = {
    ...group, id: "experience:outdoor", variantGroupId: "hotel.test/experiences/pools#outdoor",
    nameHint: "Outdoor pool", basis: "canonical_structural_entity",
  };
  const identityFact = (name) => ({
    category: "experiences", subject: name, attribute: "experience", label: "Experience",
    value: name, confidence: 1, sourceUrls: [url],
  });
  const detailFact = (name, value) => ({
    category: "experiences", subject: name, attribute: "description", label: "Description",
    value, confidence: 1, sourceUrls: [url],
  });

  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "experiences", expectationState: "DETERMINISTIC", expectedCount: 3,
        expectedItems: [group, indoor, outdoor],
      }],
      documents: [],
    },
    profile: { facts: [
      identityFact("Indoor and outdoor pools"),
      identityFact("Indoor mineral pool"),
      identityFact("Outdoor pool"),
      detailFact("Indoor mineral pool", "Mineral pool with temperature and opening-hour detail."),
      detailFact("Outdoor pool", "Outdoor swimming pool with depth and seasonal access detail."),
    ] },
    conflicts: [],
  });

  assert.equal(result.domains[0].inventory.status, "COMPLETE");
  assert.equal(result.domains[0].content.status, "COMPLETE");
  assert.equal(result.domains[0].content.detailed, 3);
});

test("a group heading is not auto-completed by only one detailed sibling", () => {
  const url = "https://hotel.test/events";
  const group = {
    id: "event:group", domain: "events", entityType: "event",
    variantGroupId: "hotel.test/events#special-events", nameHint: "Special events",
    url, urls: [url], languages: ["en"], crawled: true, basis: "deterministic_semantic_block_entity",
  };
  const event = {
    ...group, id: "event:one", variantGroupId: "hotel.test/events#event-one",
    nameHint: "Health Weekend", basis: "deterministic_landing_entity",
  };
  const result = buildHotelCompletenessV2({
    inventory: {
      domains: [{
        domain: "events", expectationState: "DETERMINISTIC", expectedCount: 2,
        expectedItems: [group, event],
      }],
      documents: [],
    },
    profile: { facts: [
      { category: "events", subject: "Special events", attribute: "event", label: "Event", value: "Special events", confidence: 1, sourceUrls: [url] },
      { category: "events", subject: "Health Weekend", attribute: "event", label: "Event", value: "Health Weekend", confidence: 1, sourceUrls: [url] },
      { category: "events", subject: "Health Weekend", attribute: "description", label: "Description", value: "A concrete weekend programme.", confidence: 1, sourceUrls: [url] },
    ] },
    conflicts: [],
  });

  assert.equal(result.domains[0].content.status, "ONBOARDING_REQUIRED");
  assert.equal(result.domains[0].status, "COMPLETE");
  assert.equal(result.domains[0].content.missingDetailItems.length, 1);
  assert.equal(result.domains[0].content.missingDetailItems[0].id, "event:group");
});
