import assert from "node:assert/strict";
import test from "node:test";

import { buildConfirmedManagerCandidate } from "../../lib/server/manager-change-candidate.ts";
import { buildHotelConfigVersionDiff } from "../../lib/server/factory-production-version-diff.mjs";
import { applyManagerServiceContentChanges } from "../../lib/server/manager-service-content-model.mjs";
import { applyManagerVenueContentChanges } from "../../lib/server/manager-venue-content-model.mjs";
import { prepareManagerOperationalScheduleChange } from "../../lib/server/manager-operational-schedule-changes.mjs";

const ALL_DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

function baseConfig() {
  return {
    languageDefault: "en",
    languages: ["en"],
    requestDefs: [
      {
        id: "coffee",
        type: "request",
        requestType: "coffee",
        requestKind: "standard",
        targetDepartment: "reception",
        title: { en: "Coffee" },
        description: { en: "Coffee capsules" },
        guestVisible: true,
        enabled: true,
        sortOrder: 1,
      },
      {
        id: "extra-towel",
        type: "request",
        requestType: "extra-towel",
        requestKind: "standard",
        targetDepartment: "housekeeping",
        afterHoursDepartment: "reception",
        title: { en: "Extra towel" },
        description: { en: "Request an extra towel" },
        guestVisible: true,
        enabled: true,
        sortOrder: 2,
      },
    ],
    venueRows: [{
      id: "lobby-bar",
      type: "bar",
      name: "Lobby Bar",
      nameByLang: { en: "Lobby Bar" },
      active: true,
      sortOrder: 1,
      reservationType: "request",
      reservationDepartment: "reception",
    }],
    departmentHours: {
      reception: { open: "00:00", close: "23:59" },
      housekeeping: { open: "08:00", close: "17:00" },
    },
  };
}

function combinedOperations() {
  return [
    {
      schemaVersion: "manager-service-change-v1",
      kind: "service_content_update",
      serviceId: "coffee",
      patch: {
        title: { en: "Premium coffee" },
        price: "3.50",
        currency: "EUR",
      },
    },
    {
      schemaVersion: "manager-venue-change-v1",
      kind: "venue_content_update",
      venueId: "lobby-bar",
      patch: {
        nameByLang: { en: "Lobby & Cocktail Bar" },
        hoursByLang: { en: "10:00–01:00" },
      },
    },
    {
      schemaVersion: "manager-operational-schedule-change-v1",
      kind: "set_department_schedule",
      department: "housekeeping",
      schedule: {
        is24h: false,
        windows: [{ days: ALL_DAYS, open: "08:00", close: "23:00" }],
      },
    },
  ];
}

function expectedCombinedDiff() {
  const base = baseConfig();
  const operations = combinedOperations();
  let candidate = applyManagerServiceContentChanges({
    liveConfig: base,
    operations: [operations[0]],
  }).candidateConfig;
  candidate = applyManagerVenueContentChanges({
    liveConfig: candidate,
    operations: [operations[1]],
  }).candidateConfig;
  candidate = prepareManagerOperationalScheduleChange({
    liveConfig: candidate,
    department: "housekeeping",
    schedule: operations[2].schedule,
  }).candidateConfig;
  return {
    base,
    candidate,
    diff: buildHotelConfigVersionDiff(base, candidate),
    operations,
  };
}

test("CM5.5 deterministic replay rebuilds the exact confirmed multi-scope candidate", () => {
  const expected = expectedCombinedDiff();
  const replayed = buildConfirmedManagerCandidate({
    baseConfig: expected.base,
    changeScope: ["services","venues","schedules"],
    operations: expected.operations,
    expectedDiffHash: expected.diff.diffHash,
  });

  assert.equal(replayed.validation.ok, true);
  assert.equal(replayed.validation.deterministicReplay, true);
  assert.equal(replayed.validation.diffHashMatched, true);
  assert.equal(replayed.diff.diffHash, expected.diff.diffHash);
  assert.deepEqual(replayed.candidateConfig, expected.candidate);
  assert.deepEqual(replayed.diff.changedCategories, ["services","hours","venues"]);
  assert.equal(
    replayed.candidateConfig.requestDefs[1].afterHoursDepartment,
    "reception",
  );
  assert.equal(
    replayed.candidateConfig.venueRows[0].reservationDepartment,
    "reception",
  );
});

test("CM5.5 refuses candidate creation when confirmed operations no longer match the bound diff", () => {
  const expected = expectedCombinedDiff();
  const tampered = structuredClone(expected.operations);
  tampered[0].patch.title.en = "Tampered after confirm";

  assert.throws(
    () => buildConfirmedManagerCandidate({
      baseConfig: expected.base,
      changeScope: ["services","venues","schedules"],
      operations: tampered,
      expectedDiffHash: expected.diff.diffHash,
    }),
    /CM5_CANDIDATE_DIFF_HASH_MISMATCH/,
  );
});

test("CM5.5 requires declared scope and typed operations to match exactly", () => {
  const expected = expectedCombinedDiff();

  assert.throws(
    () => buildConfirmedManagerCandidate({
      baseConfig: expected.base,
      changeScope: ["services","venues"],
      operations: expected.operations,
      expectedDiffHash: expected.diff.diffHash,
    }),
    /CM5_CANDIDATE_SCOPE_OPERATION_MISMATCH:schedules/,
  );
});

test("CM5.5 rebuilds Offer V2 operations into runtime offers without draft-only source fields", () => {
  const base = {
    ...baseConfig(),
    offers: [],
  };
  const offer = {
    schemaVersion: "hub-offer-v2",
    id: "0d2d3df4-9efe-4f8e-8ad2-7043181cc7c7",
    key: "spa-week",
    titleByLang: { en: "Spa week" },
    shortDescriptionByLang: { en: "Special spa package" },
    descriptionByLang: {},
    badgeByLang: {},
    pricing: {
      amountMinor: 9900,
      previousAmountMinor: null,
      currency: "EUR",
    },
    validity: {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    },
    cta: {
      labelByLang: {},
      action: "none",
      destination: null,
    },
    assets: {
      coverAssetId: null,
      galleryAssetIds: [],
      attachmentAssetIds: [],
      readyCreativeByLang: {},
    },
    presentationMode: "structured",
    status: "active",
    sortOrder: 1,
    source: {
      kind: "change_editor",
      sourceRef: "draft-1",
    },
    designDraft: true,
  };
  const expectedCandidate = structuredClone(base);
  expectedCandidate.offers = [{
    id: offer.id,
    key: offer.key,
    titleByLang: offer.titleByLang,
    shortDescriptionByLang: offer.shortDescriptionByLang,
    descriptionByLang: offer.descriptionByLang,
    badgeByLang: offer.badgeByLang,
    pricing: offer.pricing,
    validity: offer.validity,
    cta: offer.cta,
    assets: offer.assets,
    presentationMode: "structured",
    status: "active",
    sortOrder: 1,
  }];
  const diff = buildHotelConfigVersionDiff(base, expectedCandidate);

  const replayed = buildConfirmedManagerCandidate({
    baseConfig: base,
    changeScope: ["offers"],
    operations: [{
      schemaVersion: "manager-offer-change-v1",
      kind: "replace_offers",
      offers: [offer],
    }],
    expectedDiffHash: diff.diffHash,
  });

  assert.deepEqual(replayed.candidateConfig, expectedCandidate);
  assert.deepEqual(replayed.diff.changedCategories, ["content"]);
});
