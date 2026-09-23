import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAncillaryRevenueSnapshot,
  canonicalRevenueCurrency,
  parseRevenueMoneyToMinor,
} from "../../lib/revenue/ancillary-revenue-model.mjs";

test("Revenue money parsing uses minor units and keeps currencies separate", () => {
  assert.equal(parseRevenueMoneyToMinor("25,00"), 2500);
  assert.equal(parseRevenueMoneyToMinor(25), 2500);
  assert.equal(parseRevenueMoneyToMinor("2.690,50 €"), 269050);
  assert.equal(canonicalRevenueCurrency("€"), "EUR");
  assert.equal(canonicalRevenueCurrency("usd"), "USD");
});

test("Revenue snapshot recognizes charge deltas and verified AI attribution", () => {
  const snapshot = buildAncillaryRevenueSnapshot({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-10-01T00:00:00.000Z",
    generatedAt: "2026-09-23T10:00:00.000Z",
    billableServiceKeys: ["late_checkout"],
    requests: [
      {
        id: "request-1",
        stay_id: "stay-1",
        request_type: "late_checkout",
        room_number_snapshot: "101",
        source: "guest_hub",
        channel: "pwa",
        created_at: "2026-09-10T10:10:00.000Z",
        is_test: false,
        metadata_json: {
          requiresBilling: true,
          price: "25,00",
          currency: "€",
          sourceRequestDef: "late_checkout",
          billingStatus: "charged",
          billingAmountMinor: 2500,
          billingCurrencyCode: "EUR",
        },
      },
    ],
    events: [
      {
        id: "ai-show-1",
        stay_id: "stay-1",
        user_session_id: "session-1",
        event_name: "ai_action_shown",
        created_at: "2026-09-10T10:00:00.000Z",
        is_test: false,
        extra: {
          actions: [
            {
              kind: "request_def",
              targetId: "late_checkout",
              matchedId: "service:late_checkout",
            },
          ],
        },
      },
      {
        id: "ai-click-1",
        stay_id: "stay-1",
        user_session_id: "session-1",
        event_name: "ai_action_clicked",
        item_key: "late_checkout",
        created_at: "2026-09-10T10:05:00.000Z",
        is_test: false,
        extra: {},
      },
      {
        id: "request-created-1",
        request_id: "request-1",
        stay_id: "stay-1",
        user_session_id: "session-1",
        event_name: "request_created",
        item_key: "late_checkout",
        created_at: "2026-09-10T10:10:00.000Z",
        is_test: false,
        extra: { requestId: "request-1", sourceRequestDef: "late_checkout" },
      },
      {
        id: "billing-1",
        request_id: "request-1",
        stay_id: "stay-1",
        event_name: "request_billing_charged",
        created_at: "2026-09-10T10:30:00.000Z",
        is_test: false,
        extra: {
          requestId: "request-1",
          price: "25,00",
          currency: "€",
          sourceRequestDef: "late_checkout",
          previousBillingStatus: "pending",
          billingAmountMinor: 2500,
          billingCurrencyCode: "EUR",
          revenueDeltaMinor: 2500,
          revenueEventKind: "recognition",
          revenueLedgerVersion: 1,
        },
      },
    ],
  });

  assert.equal(snapshot.moneyMinorByCurrency.trackedRevenue.EUR, 2500);
  assert.equal(snapshot.moneyMinorByCurrency.grossRecognized.EUR, 2500);
  assert.equal(snapshot.moneyMinorByCurrency.aiAttributedRevenue.EUR, 2500);
  assert.equal(snapshot.requestFunnel.requested, 1);
  assert.equal(snapshot.requestFunnel.charged, 1);
  assert.equal(snapshot.requestFunnel.chargeRate, 1);
  assert.equal(snapshot.attribution.aiPaidActionsShown, 1);
  assert.equal(snapshot.attribution.aiPaidActionClicks, 1);
  assert.equal(snapshot.attribution.aiAttributedChargedRequests, 1);
  assert.equal(snapshot.attribution.aiClickThroughRate, 1);
  assert.equal(snapshot.attribution.aiClickToChargeRate, 1);
  assert.equal(snapshot.revenueLedger.nativeEvents, 1);
  assert.equal(snapshot.revenueLedger.deltaMismatches, 0);
});

test("Revenue snapshot applies later reversal instead of silently deleting recognized revenue", () => {
  const snapshot = buildAncillaryRevenueSnapshot({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-10-01T00:00:00.000Z",
    generatedAt: "2026-09-23T10:00:00.000Z",
    billableServiceKeys: ["massage_booking"],
    requests: [
      {
        id: "request-2",
        stay_id: "stay-2",
        request_type: "massage_booking",
        source: "guest_hub",
        channel: "pwa",
        created_at: "2026-09-11T10:00:00.000Z",
        is_test: false,
        metadata_json: {
          requiresBilling: true,
          price: "80",
          currency: "EUR",
          sourceRequestDef: "massage_booking",
          billingStatus: "cancelled",
        },
      },
    ],
    events: [
      {
        id: "billing-2a",
        request_id: "request-2",
        event_name: "request_billing_charged",
        created_at: "2026-09-11T11:00:00.000Z",
        is_test: false,
        extra: {
          requestId: "request-2",
          price: "80",
          currency: "EUR",
        },
      },
      {
        id: "billing-2b",
        request_id: "request-2",
        event_name: "request_billing_cancelled",
        created_at: "2026-09-12T11:00:00.000Z",
        is_test: false,
        extra: {
          requestId: "request-2",
          price: "80",
          currency: "EUR",
        },
      },
    ],
  });

  assert.equal(snapshot.moneyMinorByCurrency.grossRecognized.EUR, 8000);
  assert.equal(snapshot.moneyMinorByCurrency.reversals.EUR, 8000);
  assert.equal(snapshot.moneyMinorByCurrency.trackedRevenue?.EUR ?? 0, 0);
  assert.equal(snapshot.revenueLedger.recognitionEvents, 1);
  assert.equal(snapshot.revenueLedger.reversalEvents, 1);
  assert.equal(snapshot.revenueLedger.reconstructedEvents, 2);
});

test("Revenue snapshot never merges different currencies into one amount", () => {
  const snapshot = buildAncillaryRevenueSnapshot({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-10-01T00:00:00.000Z",
    generatedAt: "2026-09-23T10:00:00.000Z",
    requests: [],
    events: [
      {
        id: "eur-charge",
        request_id: "eur-request",
        event_name: "request_billing_charged",
        created_at: "2026-09-10T10:00:00.000Z",
        is_test: false,
        extra: { requestId: "eur-request", price: "10", currency: "EUR" },
      },
      {
        id: "usd-charge",
        request_id: "usd-request",
        event_name: "request_billing_charged",
        created_at: "2026-09-10T11:00:00.000Z",
        is_test: false,
        extra: { requestId: "usd-request", price: "20", currency: "USD" },
      },
    ],
  });

  assert.equal(snapshot.moneyMinorByCurrency.trackedRevenue.EUR, 1000);
  assert.equal(snapshot.moneyMinorByCurrency.trackedRevenue.USD, 2000);
  assert.equal(Object.keys(snapshot.moneyMinorByCurrency.trackedRevenue).length, 2);
});

test("Revenue runtime is Manager-scoped, entitlement-gated and refuses silent truncation", () => {
  const server = readFileSync(
    new URL("../../lib/server/revenue-intelligence.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/api/staff/revenue/summary/route.ts", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL(
      "../../app/staff/[hotelSlug]/manager/revenue/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(server, /getCurrentStaffSession\(hotelSlug, "manager"\)/);
  assert.match(server, /"revenue_intelligence"/);
  assert.match(server, /\.eq\("hotel_id", hotel\.id\)/);
  assert.match(server, /REVENUE_LEDGER_EVENT_CAP_EXCEEDED/);
  assert.match(route, /revenue_dataset_too_large/);
  assert.match(route, /No partial result|partial result/i);
  assert.match(page, /requireStaffAccess\(hotelSlug, "manager"\)/);
  assert.match(page, /"revenue_intelligence"/);
});

test("Billing decisions persist append-only revenue delta evidence without making Revenue a billing authority", () => {
  const billing = readFileSync(
    new URL("../../app/api/staff/request-billing/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(billing, /previousBillingStatus/);
  assert.match(billing, /billingAmountMinor/);
  assert.match(billing, /billingCurrencyCode/);
  assert.match(billing, /revenueDeltaMinor/);
  assert.match(billing, /revenueEventKind/);
  assert.match(billing, /revenueLedgerVersion: 1/);
  assert.doesNotMatch(billing, /revenue_intelligence/);
});

test("Revenue UI labels StayHub-only scope and does not fabricate PMS/RMS metrics", () => {
  const dashboard = readFileSync(
    new URL(
      "../../components/staff/revenue/RevenueDashboard.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const accessCard = readFileSync(
    new URL("../../components/staff/RevenueAccessCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /This is not an RMS/);
  assert.match(dashboard, /ADR \/ RevPAR \/ Occupancy/);
  assert.match(dashboard, /PMS\/RMS source/);
  assert.match(dashboard, /Tracked revenue/);
  assert.match(dashboard, /AI attribution/);
  assert.match(accessCard, /revenueIntelligence/);
  assert.match(accessCard, /\/manager\/revenue/);
});
