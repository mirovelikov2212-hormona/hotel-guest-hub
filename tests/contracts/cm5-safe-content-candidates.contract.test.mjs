import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareManagerServiceContentCandidate,
  prepareManagerVenueContentCandidate,
} from "../../lib/server/manager-safe-content-candidates.mjs";
import {
  MANAGER_SERVICE_CHANGE_SCHEMA_VERSION,
} from "../../lib/server/manager-service-content-model.mjs";
import {
  MANAGER_VENUE_CHANGE_SCHEMA_VERSION,
} from "../../lib/server/manager-venue-content-model.mjs";

test("Service candidate semantic diff cannot escape the services category", () => {
  const liveConfig = {
    languages: ["en"],
    requestDefs: [{
      id: "coffee",
      type: "request",
      requestType: "coffee",
      requestKind: "standard",
      targetDepartment: "reception",
      afterHoursDepartment: "reception-night",
      title: { en: "Coffee" },
      description: { en: "Coffee capsules" },
      guestVisible: true,
      enabled: true,
    }],
    departmentSchedules: {
      reception: {
        is24h: true,
        windows: [],
      },
    },
  };

  const candidate = prepareManagerServiceContentCandidate({
    liveConfig,
    operations: [{
      schemaVersion: MANAGER_SERVICE_CHANGE_SCHEMA_VERSION,
      kind: "service_content_update",
      serviceId: "coffee",
      patch: {
        title: { en: "Premium coffee" },
        price: "3.50",
        currency: "EUR",
      },
    }],
  });

  assert.deepEqual(candidate.diff.changedCategories, ["services"]);
  assert.equal(
    candidate.candidateConfig.requestDefs[0].afterHoursDepartment,
    "reception-night",
  );
  assert.deepEqual(
    candidate.candidateConfig.departmentSchedules,
    liveConfig.departmentSchedules,
  );
});

test("Venue candidate semantic diff cannot escape the venues category", () => {
  const liveConfig = {
    languages: ["en"],
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
    requestDefs: [{
      id: "room-service",
      requestType: "room-service",
      targetDepartment: "restaurant",
      guestVisible: true,
      enabled: true,
    }],
  };

  const candidate = prepareManagerVenueContentCandidate({
    liveConfig,
    operations: [{
      schemaVersion: MANAGER_VENUE_CHANGE_SCHEMA_VERSION,
      kind: "venue_content_update",
      venueId: "lobby-bar",
      patch: {
        nameByLang: { en: "Lobby & Cocktail Bar" },
        hoursByLang: { en: "10:00–01:00" },
      },
    }],
  });

  assert.deepEqual(candidate.diff.changedCategories, ["venues"]);
  assert.equal(
    candidate.candidateConfig.venueRows[0].reservationDepartment,
    "reception",
  );
  assert.deepEqual(candidate.candidateConfig.requestDefs, liveConfig.requestDefs);
});
