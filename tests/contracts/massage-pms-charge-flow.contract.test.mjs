import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  executeMassagePmsFolioCharge,
  prepareMassagePmsFolioCharge,
} from "../../lib/integrations/massage-pms-folio-charge.mjs";

function pmsConnection(overrides = {}) {
  return {
    connectionId: "pms_main",
    providerKey: "mock_pms",
    systemType: "pms",
    displayName: "Mock PMS",
    externalHotelId: "HOTEL-TEST-001",
    mode: "read_write",
    active: true,
    capabilities: [
      "stay.read",
      "folio.charge.post",
    ],
    credentialRef: "secret-manager://test/mock-pms",
    metadata: { environment: "test" },
    ...overrides,
  };
}

function massageBooking(overrides = {}) {
  return {
    nativeBookingId: "massage-booking-001",
    serviceId: "deep-relax-60",
    roomNumber: "201",
    amountMinor: 8000,
    currency: "EUR",
    ...overrides,
  };
}

function pmsContext(overrides = {}) {
  return {
    stayExternalId: "PMS-STAY-001",
    roomExternalId: "PMS-ROOM-201",
    serviceCode: "SPA-MASSAGE",
    ...overrides,
  };
}

test("massage booking carries the billing lineage needed for later PMS charging", () => {
  const source = readFileSync(
    new URL("../../lib/server/massage-staff-request.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /requiresBilling:\s*true/);
  assert.match(source, /billingStatus:\s*"pending"/);
  assert.match(source, /nativeBookingId/);
  assert.match(source, /serviceId:\s*input\.serviceId/);
  assert.match(source, /roomNumber:\s*input\.roomNumber/);
  assert.match(source, /price:\s*price \|\| null/);
  assert.match(source, /currency/);
  assert.match(source, /stayId/);
  assert.match(source, /stayDeviceId/);
});

test("reservation -> folio.charge.post -> PMS ACK -> charged preserves exact massage financial identity", async () => {
  const calls = [];

  const result = await executeMassagePmsFolioCharge({
    connection: pmsConnection(),
    booking: massageBooking(),
    pms: pmsContext(),
    postFolioCharge: async (command) => {
      calls.push(command);
      return {
        ok: true,
        transactionExternalId: "PMS-FOLIO-TXN-9001",
        postedAt: "2026-09-24T16:00:00.000Z",
      };
    },
  });

  assert.equal(calls.length, 1);
  const command = calls[0];

  assert.equal(command.actionType, "folio.charge.post");
  assert.equal(command.capability, "folio.charge.post");
  assert.equal(command.target.stayExternalId, "PMS-STAY-001");
  assert.equal(command.target.roomExternalId, "PMS-ROOM-201");
  assert.equal(command.input.amountMinor, 8000);
  assert.equal(command.input.currency, "EUR");
  assert.equal(command.input.serviceCode, "SPA-MASSAGE");
  assert.equal(command.input.gostayaBookingId, "massage-booking-001");
  assert.equal(command.input.roomNumber, "201");
  assert.equal(command.input.serviceId, "deep-relax-60");
  assert.equal(command.executionPolicy.approvalPolicy, "verified_workflow_or_human");
  assert.equal(command.executionPolicy.directAiExecutionAllowed, false);
  assert.equal(command.executionPolicy.directDatabaseWriteAllowed, false);

  assert.equal(result.state, "charged");
  assert.equal(result.charged, true);
  assert.equal(result.retryRequired, false);
  assert.equal(result.pmsTransactionExternalId, "PMS-FOLIO-TXN-9001");
  assert.equal(result.amountMinor, 8000);
  assert.equal(result.currency, "EUR");
});

test("PMS timeout never becomes charged and remains safely retryable", async () => {
  const result = await executeMassagePmsFolioCharge({
    connection: pmsConnection(),
    booking: massageBooking({ nativeBookingId: "massage-booking-timeout" }),
    pms: pmsContext(),
    postFolioCharge: async () => {
      throw new Error("provider timeout");
    },
  });

  assert.equal(result.state, "pending_pms");
  assert.equal(result.charged, false);
  assert.equal(result.retryRequired, true);
  assert.equal(result.pmsTransactionExternalId, null);
  assert.equal(result.errorCode, "PMS_FOLIO_CHARGE_TRANSPORT_ERROR");
});

test("PMS rejection or incomplete ACK never becomes charged", async () => {
  const rejected = await executeMassagePmsFolioCharge({
    connection: pmsConnection(),
    booking: massageBooking({ nativeBookingId: "massage-booking-rejected" }),
    pms: pmsContext(),
    postFolioCharge: async () => ({
      ok: false,
      errorCode: "PMS_FOLIO_REJECTED",
    }),
  });

  const missingTransaction = await executeMassagePmsFolioCharge({
    connection: pmsConnection(),
    booking: massageBooking({ nativeBookingId: "massage-booking-no-txn" }),
    pms: pmsContext(),
    postFolioCharge: async () => ({
      ok: true,
      postedAt: "2026-09-24T16:05:00.000Z",
    }),
  });

  for (const result of [rejected, missingTransaction]) {
    assert.equal(result.state, "pending_pms");
    assert.equal(result.charged, false);
    assert.equal(result.retryRequired, true);
    assert.equal(result.pmsTransactionExternalId, null);
  }

  assert.equal(rejected.errorCode, "PMS_FOLIO_REJECTED");
  assert.equal(
    missingTransaction.errorCode,
    "PMS_FOLIO_CHARGE_NOT_CONFIRMED",
  );
});

test("retrying the same GOSTAYA massage booking produces the same PMS idempotency key", () => {
  const first = prepareMassagePmsFolioCharge({
    connection: pmsConnection(),
    booking: massageBooking(),
    pms: pmsContext(),
  });
  const second = prepareMassagePmsFolioCharge({
    connection: pmsConnection(),
    booking: massageBooking(),
    pms: pmsContext(),
  });

  assert.equal(first.command.idempotencyKey, second.command.idempotencyKey);
  assert.equal(first.command.idempotencyKey.length, 64);
  assert.equal(first.command.correlationId, "massage-booking-001");
});

test("PMS write requires an explicit mapped service code and external stay identity", () => {
  assert.throws(
    () =>
      prepareMassagePmsFolioCharge({
        connection: pmsConnection(),
        booking: massageBooking(),
        pms: pmsContext({ serviceCode: "" }),
      }),
    /PMS_SERVICE_CODE_REQUIRED/,
  );

  assert.throws(
    () =>
      prepareMassagePmsFolioCharge({
        connection: pmsConnection(),
        booking: massageBooking(),
        pms: pmsContext({ stayExternalId: "" }),
      }),
    /PMS_STAY_EXTERNAL_ID_REQUIRED/,
  );
});

test("read-only PMS connection cannot post a massage charge", () => {
  assert.throws(
    () =>
      prepareMassagePmsFolioCharge({
        connection: pmsConnection({
          mode: "read_only",
          capabilities: ["stay.read"],
        }),
        booking: massageBooking(),
        pms: pmsContext(),
      }),
    /INTEGRATION_CAPABILITY_REQUIRED/,
  );
});
