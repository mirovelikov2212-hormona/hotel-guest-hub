import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  answerFromGuestStayContext,
  detectGuestStayContextIntent,
  GUEST_STAY_CONTEXT_INTENTS,
} from "../../lib/ai/guest-stay-context.mjs";

const stayContext = {
  version: 1,
  scope: "current_stay",
  generatedAt: "2026-09-10T12:30:00.000Z",
  stay: {
    id: "StaySecretId",
    roomNumber: "412",
    lifecycleState: "active",
    checkInDate: "2026-09-10",
    checkOutDate: "2026-09-14",
    effectiveCheckOutAt: "2026-09-14T09:00:00.000Z",
    lastSeenAt: "2026-09-10T12:00:00.000Z",
    isTest: false,
  },
  observedLanguage: "de",
  requests: {
    total: 4,
    active: 1,
    completed: 3,
    returned: 1,
    firstResponseBreaches: 2,
    activeSlaBreaches: 1,
  },
  communications: {
    total: 2,
    fromGuest: 1,
    fromStaff: 1,
    lastActivityAt: "2026-09-10T11:00:00.000Z",
  },
  feedback: {
    total: 1,
    latestRating: 2,
    averageRating: 2,
    needsAttention: true,
    selectedCategories: [{ category: "staff", count: 1 }],
  },
  bookings: {
    total: 2,
    active: 1,
    cancelled: 1,
    upcoming: 1,
  },
  observedServiceUsage: [
    { serviceKey: "ExtraTowel", count: 2 },
    { serviceKey: "LateCheckout", count: 1 },
  ],
  attention: [
    { type: "sla_breach", requestId: "ReqSecret", occurredAt: "2026-09-10T12:10:00.000Z" },
    { type: "critical_feedback", surveyId: "SurveySecret", occurredAt: "2026-09-10T12:20:00.000Z", rating: 2 },
  ],
  preferences: { scope: "current_stay", explicit: [], inferred: false },
  privacy: { personalIdentityStored: false, crossStayProfile: false, freeTextIncluded: false },
};

test("OA5 detects current-stay request intent across all six guest languages", () => {
  const samples = [
    "Какви заявки имам?",
    "What are my active requests?",
    "Meine offenen Anfragen",
    "Solicitările mele",
    "Moje aktivní požadavky",
    "Мои активные заявки",
  ];
  for (const sample of samples) {
    assert.equal(detectGuestStayContextIntent(sample), GUEST_STAY_CONTEXT_INTENTS.REQUESTS, sample);
  }
});

test("OA5 detects massage, stay-date and observed-service intents conservatively", () => {
  assert.equal(detectGuestStayContextIntent("Имам ли запазен масаж?"), GUEST_STAY_CONTEXT_INTENTS.MASSAGE);
  assert.equal(detectGuestStayContextIntent("When do I check out?"), GUEST_STAY_CONTEXT_INTENTS.STAY_DATES);
  assert.equal(detectGuestStayContextIntent("Welche Services habe ich genutzt?"), GUEST_STAY_CONTEXT_INTENTS.SERVICE_USAGE);
  assert.equal(detectGuestStayContextIntent("What time does the restaurant close?"), null);
  assert.equal(detectGuestStayContextIntent("Имате ли масажи в хотела?"), null);
});

test("OA5 guest-safe projection excludes manager-only SLA, return, feedback and canonical identifiers", () => {
  const result = answerFromGuestStayContext({
    intent: GUEST_STAY_CONTEXT_INTENTS.REQUESTS,
    lang: "bg",
    stayContext,
  });
  assert.ok(result);
  assert.equal(result.guestSafeContext.requests.total, 4);
  assert.equal(result.guestSafeContext.requests.active, 1);

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("StaySecretId"));
  assert.ok(!serialized.includes("ReqSecret"));
  assert.ok(!serialized.includes("SurveySecret"));
  assert.ok(!serialized.includes("activeSlaBreaches"));
  assert.ok(!serialized.includes("firstResponseBreaches"));
  assert.ok(!serialized.includes("returned"));
  assert.ok(!serialized.includes("selectedCategories"));
  assert.ok(!serialized.includes("needsAttention"));
  assert.ok(!serialized.includes("attention"));
  assert.ok(!serialized.includes("observedLanguage"));
});

test("OA5 personalized answers use only verified current-stay facts and never claim inferred preferences", () => {
  const requests = answerFromGuestStayContext({
    intent: GUEST_STAY_CONTEXT_INTENTS.REQUESTS,
    lang: "en",
    stayContext,
  });
  const massage = answerFromGuestStayContext({
    intent: GUEST_STAY_CONTEXT_INTENTS.MASSAGE,
    lang: "de",
    stayContext,
  });
  const dates = answerFromGuestStayContext({
    intent: GUEST_STAY_CONTEXT_INTENTS.STAY_DATES,
    lang: "bg",
    stayContext,
  });
  const usage = answerFromGuestStayContext({
    intent: GUEST_STAY_CONTEXT_INTENTS.SERVICE_USAGE,
    lang: "en",
    stayContext,
  });

  assert.match(requests.answer, /4 requests/i);
  assert.match(massage.answer, /1 aktive Massagebuchung/i);
  assert.match(dates.answer, /10\.09\.2026.*14\.09\.2026/);
  assert.match(usage.answer, /observed activity|recorded/i);
  assert.ok(!usage.answer.toLowerCase().includes("you prefer"));
});

test("OA5 refuses a non-current-stay object instead of treating it as guest profile authority", () => {
  const result = answerFromGuestStayContext({
    intent: GUEST_STAY_CONTEXT_INTENTS.REQUESTS,
    lang: "en",
    stayContext: { ...stayContext, scope: "cross_stay_profile" },
  });
  assert.equal(result, null);
});

test("OA5 AI route requires canonical stay/device read validation before loading personalized context", async () => {
  const route = await readFile(new URL("../../app/api/ai/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes("detectGuestStayContextIntent(question)"));
  assert.ok(route.includes("requireGuestStayReadAccess({"));
  assert.ok(route.includes("hotelId: context.hotel.id"));
  assert.ok(route.includes("room,"));
  assert.ok(route.includes("stayId,"));
  assert.ok(route.includes("stayDeviceId,"));
  assert.ok(route.includes("validatedStayId = String(stayAccess.stay.id)"));
  assert.ok(route.includes("loadUnifiedGuestTimelineForStay({"));
  assert.ok(route.includes("stayId: validatedStayId"));
  assert.ok(route.includes("answerFromGuestStayContext({"));
  assert.ok(route.includes('error: "stay_context_identity_required"'));
  assert.ok(route.includes('error: "stay_context_unavailable"'));
});

test("OA5 stay-context answers execute before hotel-global catalog caching and never create operational actions", async () => {
  const route = await readFile(new URL("../../app/api/ai/route.ts", import.meta.url), "utf8");
  const contextIntentIndex = route.indexOf("const stayIntent = detectGuestStayContextIntent(question)");
  const cacheIndex = route.indexOf("const { catalog, cacheHit } = await getCachedCatalog");
  assert.ok(contextIntentIndex >= 0);
  assert.ok(cacheIndex > contextIntentIndex);

  const personalizedBlock = route.slice(contextIntentIndex, cacheIndex);
  assert.ok(personalizedBlock.includes("operationalAction: null"));
  assert.ok(personalizedBlock.includes('operationalActionStatus: "not_applicable"'));
  assert.ok(!personalizedBlock.includes("resolveOperationalWorkflow"));
  assert.ok(!personalizedBlock.includes("routeWithOpenAi"));
});

test("OA5 GuestHub sends only stay locators, never a client-authored profile/context object", async () => {
  const source = await readFile(new URL("../../components/GuestHub.tsx", import.meta.url), "utf8");
  const aiCallIndex = source.indexOf('fetch("/api/ai"');
  assert.ok(aiCallIndex >= 0);
  const block = source.slice(aiCallIndex, aiCallIndex + 900);
  assert.ok(block.includes("room,"));
  assert.ok(block.includes("stayId: activeStayId"));
  assert.ok(block.includes("stayDeviceId,"));
  assert.ok(!block.includes("stayContext:"));
  assert.ok(!block.includes("guestProfile:"));
  assert.ok(!block.includes("attention:"));
});

test("OA5 AI route has no direct stay-profile write authority", async () => {
  const route = await readFile(new URL("../../app/api/ai/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("const stayIntent = detectGuestStayContextIntent(question)");
  const end = route.indexOf("const { catalog, cacheHit } = await getCachedCatalog");
  const personalizedBlock = route.slice(start, end);
  assert.ok(!personalizedBlock.includes(".insert("));
  assert.ok(!personalizedBlock.includes(".update("));
  assert.ok(!personalizedBlock.includes(".delete("));
});
