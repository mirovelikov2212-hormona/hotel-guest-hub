import assert from "node:assert/strict";
import test from "node:test";

import { buildHotelTechnologyDiscovery } from "../../lib/ai/hotel-technology-discovery.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";

function evidence() {
  return {
    canonicalUrl: "https://pavelbanyagrand.com/",
    pages: [
      {
        url: "https://pavelbanyagrand.com/",
        text: "Grand Resort Pavel Banya. Reserve your stay.",
        technology: {
          externalLinks: [
            "https://booking.quendoo.com/hotel/grand-resort",
            "https://reservations.pavelbanyagrand.com/?lng=en",
          ],
          scriptSrcs: [],
          iframeSrcs: [],
          formActions: [],
          manifestUrls: [],
          serviceWorkerUrls: [],
        },
      },
      {
        url: "https://pavelbanyagrand.com/en/careers",
        text: "Front Office Manager: proficiency in Clock Evolution hotel management software.",
        technology: {
          externalLinks: [],
          scriptSrcs: [],
          iframeSrcs: [],
          formActions: [],
          manifestUrls: [],
          serviceWorkerUrls: [],
        },
      },
    ],
  };
}

test("technology discovery retains Quendoo and Clock as confirmed public evidence", () => {
  const result = buildHotelTechnologyDiscovery(evidence());
  const quendoo = result.providers.find((item) => item.provider === "Quendoo");
  const clock = result.providers.find((item) => item.provider === "Clock PMS+ / Clock Evolution");

  assert.equal(quendoo?.classification, "CONFIRMED PUBLIC EVIDENCE");
  assert.equal(quendoo?.category, "booking_engine");
  assert.ok(quendoo?.evidence.some((item) => item.value.includes("booking.quendoo.com")));

  assert.equal(clock?.classification, "CONFIRMED PUBLIC EVIDENCE");
  assert.equal(clock?.category, "pms");
  assert.ok(clock?.evidence.some((item) => item.kind === "page_text" && /Clock Evolution/i.test(item.value)));
});

test("technology discovery retains external/subdomain booking evidence", () => {
  const result = buildHotelTechnologyDiscovery(evidence());
  assert.equal(result.capabilities.bookingTechnology.classification, "CONFIRMED PUBLIC EVIDENCE");
  assert.ok(result.capabilities.bookingTechnology.urls.some((url) => url.includes("booking.quendoo.com")));
  assert.ok(result.subdomains.some((url) => url.includes("reservations.pavelbanyagrand.com")));
});

test("Operational Guest Hub is NOT PUBLICLY EVIDENCED without positive evidence, never declared absent", () => {
  const result = buildHotelTechnologyDiscovery(evidence());
  assert.equal(result.capabilities.operationalGuestHub.classification, "NOT PUBLICLY EVIDENCED");
  assert.deepEqual(result.capabilities.operationalGuestHub.evidence, []);
  assert.match(result.capabilities.operationalGuestHub.note, /not a claim/i);
  assert.equal(result.scope.absenceClaimsForbidden, true);
});

test("positive guest-facing platform evidence changes Guest Hub semantics to confirmed", () => {
  const input = evidence();
  input.pages.push({
    url: "https://pavelbanyagrand.com/guest",
    text: "Open our digital concierge and guest portal during your stay.",
    technology: {
      externalLinks: [],
      scriptSrcs: [],
      iframeSrcs: [],
      formActions: [],
      manifestUrls: [],
      serviceWorkerUrls: [],
    },
  });

  const result = buildHotelTechnologyDiscovery(input);
  assert.equal(result.capabilities.operationalGuestHub.classification, "CONFIRMED PUBLIC EVIDENCE");
  assert.ok(result.capabilities.operationalGuestHub.evidence.some((item) => /digital concierge/i.test(item.value)));
});

test("scanner captures raw technology evidence and returns semantic technology discovery separately from readiness", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const route = await readProjectFile(routePath);

  assert.match(crawler, /technology: extractPublicTechnologySignals\(html, url\)/);
  assert.match(route, /buildHotelTechnologyDiscovery\(evidence\)/);
  assert.match(route, /technologyDiscovery,/);
  assert.match(route, /technologyProviderCount: technologyDiscovery\.providers\.length/);
  assert.doesNotMatch(route, /reviewRequiredCount\s*[:=].*technology/i);
  assert.doesNotMatch(route, /buildHotelIntelligencePackage\([^)]*technologyDiscovery/);
});
