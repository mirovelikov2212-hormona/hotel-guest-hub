import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPrivacyMinimalHotelProjection,
  isPrivacyMinimalHotelBusinessEmail,
} from "../../lib/ai/hotel-scanner-privacy.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

test("privacy projection accepts property business inboxes and rejects direct-person inboxes", () => {
  assert.equal(isPrivacyMinimalHotelBusinessEmail("info@hotel.test"), true);
  assert.equal(isPrivacyMinimalHotelBusinessEmail("reservations@hotel.test"), true);
  assert.equal(isPrivacyMinimalHotelBusinessEmail("spa@hotel.test"), true);
  assert.equal(isPrivacyMinimalHotelBusinessEmail("john.smith@hotel.test"), false);
});

test("privacy projection removes direct-person contacts before Hotel Intelligence handoff", () => {
  const result = applyPrivacyMinimalHotelProjection({
    contacts: {
      emails: ["info@hotel.test", "john.smith@hotel.test"],
      phones: [],
      socialLinks: [],
    },
    facts: [
      {
        category: "contact", subject: "hotel", attribute: "email", label: "Имейл", value: "reservations@hotel.test",
        confidence: 1, sourceUrls: ["https://hotel.test/contact"],
      },
      {
        category: "contact", subject: "John Smith", attribute: "email", label: "Имейл", value: "john.smith@hotel.test",
        confidence: 1, sourceUrls: ["https://hotel.test/team"],
      },
      {
        category: "accommodation", subject: "Suite", attribute: "room_type", label: "Тип стая", value: "Suite",
        confidence: 1, sourceUrls: ["https://hotel.test/rooms"],
      },
    ],
  });

  assert.deepEqual(result.profile.contacts.emails, ["info@hotel.test"]);
  assert.equal(result.profile.facts.length, 2);
  assert.ok(result.profile.facts.some((fact) => fact.value === "reservations@hotel.test"));
  assert.ok(result.profile.facts.some((fact) => fact.value === "Suite"));
  assert.ok(result.filtered.some((item) => item.reason === "personal_or_non_business_email_not_projected"));
  assert.ok(result.filtered.some((item) => item.reason === "direct_person_contact_not_projected"));
  assert.equal(result.policy.scope, "public_business_information_only");
  assert.equal(result.policy.personalProfileEnrichment, false);
});

test("scanner API applies public-business input authority and privacy projection before verification", async () => {
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/scan/route.ts");
  assert.match(route, /isPublicBusinessCrawlUrl/);
  assert.match(route, /scanner_url_not_public_business_surface/);
  assert.match(route, /applyPrivacyMinimalHotelProjection/);
  assert.match(route, /privacyProjection\.profile/);
  assert.match(route, /hotel-scanner-v3-critical-verification/);
});
