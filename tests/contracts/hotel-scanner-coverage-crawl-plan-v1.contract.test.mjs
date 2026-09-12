import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHotelScannerPageCoverage,
  classifyHotelScannerUrlCoverage,
  isPublicBusinessCrawlUrl,
  planHotelScannerSecondaryUrls,
} from "../../lib/server/hotel-scanner-crawl-plan.mjs";
import { selectHotelScannerHubPages } from "../../lib/ai/hotel-scanner-hub-pages.mjs";
import { buildHotelScannerHubSections, hotelScannerHubSectionForFact } from "../../lib/ai/hotel-scanner-hub-sections.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const origin = "https://hotel.test";
const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const CANONICAL_DOMAINS = [
  "identity", "location", "contacts", "accommodation", "check_in_out", "policies", "faq_terms", "dining",
  "wellness", "services", "experiences", "offers", "events", "booking", "technology", "design",
];
function plan(links, maxPages = 8, domainVisitCounts = {}) { return planHotelScannerSecondaryUrls({ links, canonicalOrigin: origin, firstUrl: `${origin}/`, maxPages, domainVisitCounts }); }

test("coverage planner exposes public hotel business domains only", () => {
  const result = planHotelScannerSecondaryUrls({ maxPages: 0 });
  assert.deepEqual(result.uncoveredDomains, CANONICAL_DOMAINS);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/gallery`), ["design"]);
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/hotel-software-integration`), ["identity", "technology"]);
  assert.ok(classifyHotelScannerUrlCoverage(`${origin}/experiences`).includes("experiences"));
});

test("public business crawl guard rejects personal, account, payment and tokenized surfaces", () => {
  for (const blocked of [`${origin}/login`, `${origin}/account`, `${origin}/profile`, `${origin}/my-booking`, `${origin}/manage-reservation`, `${origin}/checkout`, `${origin}/payment`, `${origin}/admin`, `${origin}/team`, `${origin}/staff`, `${origin}/careers`, `${origin}/rooms?token=secret`, `${origin}/spa?email=person@example.com`, `${origin}/booking?reservation_id=123`]) assert.equal(isPublicBusinessCrawlUrl(blocked, origin), false, blocked);
  for (const allowed of [`${origin}/`, `${origin}/rooms`, `${origin}/guest-information`, `${origin}/hotel-policy`, `${origin}/faq`, `${origin}/gastronomy`, `${origin}/spa`, `${origin}/services`, `${origin}/experiences`, `${origin}/events`, `${origin}/contact`, `${origin}/booking-information`]) assert.equal(isPublicBusinessCrawlUrl(allowed, origin), true, allowed);
});

test("first-page content deterministically detects high-value hotel coverage", () => {
  const coverage = classifyHotelScannerPageCoverage({ title: "Grand Resort", description: "Medical and SPA hotel", text: "Rooms and apartments. Check-in 15:00. Check-out 12:00. Restaurant Forum. SPA wellness. Experiences and nearby attractions. Reservations +359 888 123 456 info@hotel.test" });
  for (const expected of ["identity", "contacts", "accommodation", "check_in_out", "dining", "wellness", "experiences", "booking"]) assert.ok(coverage.includes(expected), expected);
});

test("planner balances breadth with corroboration instead of treating one page as domain completion", () => {
  const result = plan([`${origin}/rooms`, `${origin}/rooms/economy`, `${origin}/contact`, `${origin}/faq`, `${origin}/terms`, `${origin}/hotel-policy`, `${origin}/gastronomy`, `${origin}/restaurant/nero`, `${origin}/spa`, `${origin}/healing`, `${origin}/services`], 8, { dining: 1, wellness: 1, policies: 1, faq_terms: 1 });
  assert.equal(result.urls.length, 8);
  assert.ok(result.selections.some((selection) => selection.corroboratedDomains.includes("policies")));
  assert.ok(result.selections.some((selection) => selection.corroboratedDomains.includes("dining")));
  assert.ok(result.selections.some((selection) => selection.corroboratedDomains.includes("wellness")));
  assert.ok(result.underCorroboratedDomains.length < CANONICAL_DOMAINS.length);
});

test("one multipurpose information URL can still cover several semantic domains while Hub landing pages may outrank it", () => {
  assert.deepEqual(classifyHotelScannerUrlCoverage(`${origin}/hotel-information-check-in-policies`), ["identity", "check_in_out", "policies", "faq_terms"]);
  const result = plan([`${origin}/hotel-information-check-in-policies`, `${origin}/contact`, `${origin}/rooms`, `${origin}/restaurant`, `${origin}/spa`], 5);
  const selection = result.selections.find((item) => item.url === `${origin}/hotel-information-check-in-policies`);
  assert.ok(selection);
  assert.deepEqual(selection.domains, ["identity", "check_in_out", "policies", "faq_terms"]);
  assert.ok(result.urls.indexOf(`${origin}/spa`) < result.urls.indexOf(`${origin}/hotel-information-check-in-policies`));
});

test("planner is deterministic and stays inside origin, privacy boundary and budget", () => {
  const links = [`${origin}/restaurant-a`, `${origin}/restaurant-b`, `${origin}/spa-a`, `${origin}/spa-b`, `${origin}/contact`, `${origin}/faq`, `${origin}/hotel-policy`, `${origin}/login`, `${origin}/team`, `${origin}/rooms?token=secret`, "https://other.test/policies"];
  const first = plan(links, 6); const second = plan(links, 6); assert.deepEqual(first, second); assert.ok(first.urls.length <= 6); assert.equal(new Set(first.urls).size, first.urls.length); assert.equal(first.urls.some((url) => url.startsWith("https://other.test")), false); assert.equal(first.urls.some((url) => /login|team|token=/i.test(url)), false);
});

test("critical domains remain eligible until target corroboration depth is reached", () => {
  const lowDepth = plan([`${origin}/restaurant`, `${origin}/restaurant/nero`, `${origin}/spa`, `${origin}/healing`, `${origin}/faq`, `${origin}/hotel-policy`], 6, { dining: 1, wellness: 1, policies: 1, faq_terms: 1 });
  assert.ok(lowDepth.urls.includes(`${origin}/restaurant`)); assert.ok(lowDepth.urls.includes(`${origin}/spa`)); assert.ok(lowDepth.urls.includes(`${origin}/faq`));
  const fullDepth = plan([`${origin}/restaurant`, `${origin}/spa`, `${origin}/hotel-policy`], 3, { dining: 5, wellness: 5, policies: 5, faq_terms: 5 }); assert.ok(fullDepth.urls.length <= 3); assert.ok(fullDepth.selections.every((selection) => Number.isFinite(selection.score)));
});

test("hub-critical public sections outrank noisy room details in the crawl budget", () => {
  const links = Array.from({ length: 16 }, (_, index) => `${origin}/rooms/room-${index + 1}`).concat([`${origin}/experiences`, `${origin}/services`, `${origin}/gastronomy`, `${origin}/events`]);
  const result = plan(links, 8);
  for (const expected of [`${origin}/experiences`, `${origin}/services`, `${origin}/gastronomy`, `${origin}/events`]) assert.ok(result.urls.includes(expected), expected);
  assert.deepEqual(result.urls.slice(0, 4), [`${origin}/experiences`, `${origin}/services`, `${origin}/gastronomy`, `${origin}/events`]);
});

test("hub page selector is bounded, deterministic and preserves the four public content families", () => {
  const pages = Array.from({ length: 20 }, (_, index) => ({ url: `${origin}/rooms/${index}`, title: `Room ${index}`, description: "Room", text: "Spacious room" })).concat([
    { url: `${origin}/experiences`, title: "Experiences", description: "Activities", text: "Rose Valley and nearby attractions" },
    { url: `${origin}/services`, title: "Services", description: "Guest services", text: "Parking, transfer and kids corner" },
    { url: `${origin}/gastronomy`, title: "Gastronomy", description: "Dining", text: "Restaurant Forum, NERO, Lobby Bar, Nutrition Bar" },
    { url: `${origin}/events`, title: "Events", description: "Meetings", text: "Conference and wedding events" },
  ]);
  const first = selectHotelScannerHubPages(pages, { maxPages: 10 }); const second = selectHotelScannerHubPages([...pages].reverse(), { maxPages: 10 });
  assert.ok(first.length <= 10); assert.deepEqual(first.map((page) => page.url).sort(), second.map((page) => page.url).sort());
  for (const suffix of ["/experiences", "/services", "/gastronomy", "/events"]) assert.ok(first.some((page) => page.url.endsWith(suffix)), suffix);
});

test("hub projector keeps guest content separate and routes static event facilities to services", () => {
  const fact = (category, subject, attribute, label, value, sourceUrl) => ({ category, subject, attribute, label, value, confidence: 0.9, sourceUrls: [sourceUrl] });
  const facts = [
    fact("accommodation", "Deluxe room", "capacity", "Capacity", "2 adults + 1 child", `${origin}/rooms/deluxe`),
    fact("accommodation", "Deluxe room", "price", "Price", "200 EUR", `${origin}/rooms/deluxe`),
    fact("dining", "Restaurant Forum", "venue", "Restaurant Forum", "Restaurant Forum", `${origin}/gastronomy`),
    fact("dining", "NERO Dining Club", "venue", "NERO Dining Club", "NERO Dining Club", `${origin}/gastronomy`),
    fact("dining", "Lobby Bar", "venue", "Lobby Bar", "Lobby Bar", `${origin}/gastronomy`),
    fact("dining", "Nutrition Bar", "venue", "Nutrition Bar", "Nutrition Bar", `${origin}/gastronomy`),
    fact("services", "Rose Valley", "activity", "Rose Valley", "Rose Valley", `${origin}/experiences`),
    fact("services", "Transfer", "service", "Transfer", "Transfer service", `${origin}/services`),
    fact("events", "Conference hall", "event_space", "Conference hall", "Conference hall", `${origin}/events`),
    fact("contact", "hotel", "phone", "Phone", "+359 000", `${origin}/contact`),
    fact("policy", "hotel", "pet_policy", "Pets", "Pets are not allowed", `${origin}/faq`),
  ];
  assert.equal(hotelScannerHubSectionForFact(facts[6]), "experiences");
  assert.equal(hotelScannerHubSectionForFact(facts[8]), "services");
  const sections = buildHotelScannerHubSections(facts); const byKey = Object.fromEntries(sections.map((section) => [section.key, section]));
  assert.equal(byKey.accommodation.items[0].facts.length, 2); assert.equal(byKey.dining.items.length, 4); assert.equal(byKey.experiences.items.length, 1); assert.equal(byKey.services.items.length, 2); assert.equal(byKey.events, undefined); assert.equal(byKey.contacts.facts.length, 1); assert.equal(byKey.policies.facts.length, 1);
  assert.deepEqual(byKey.accommodation.items[0].sourceUrls, [`${origin}/rooms/deluxe`]);
});

test("production crawler is bounded but deep, discovers robots/sitemaps and tracks domain visit depth", async () => {
  const crawler = await readProjectFile(crawlerPath);
  assert.match(crawler, /MAX_PAGES = 28/); assert.match(crawler, /MAX_SECONDARY_PAGES = MAX_PAGES - 1/); assert.match(crawler, /MAX_CRAWL_BATCH_SIZE = 8/); assert.match(crawler, /MAX_CRAWL_WAVES = 5/); assert.match(crawler, /MAX_DISCOVERED_URLS = 600/); assert.match(crawler, /robots\.txt/); assert.match(crawler, /MAX_SITEMAP_DOCUMENTS = 12/); assert.match(crawler, /discoverSitemapPageUrls/); assert.match(crawler, /domainVisitCounts/); assert.match(crawler, /planHotelScannerSecondaryUrls/); assert.match(crawler, /for \(let wave = 0; wave < MAX_CRAWL_WAVES; wave \+= 1\)/); assert.match(crawler, /page\.links/); assert.doesNotMatch(crawler, /MAX_PAGES = 6/);
});