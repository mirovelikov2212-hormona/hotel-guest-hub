import { buildIntegrationCommand } from "./integration-contract.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function requiredText(value, code, maxLength = 240) {
  const normalized = clean(value);
  if (!normalized || normalized.length > maxLength) throw new Error(code);
  return normalized;
}

function positiveMinor(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("PMS_FOLIO_CHARGE_AMOUNT_INVALID");
  }
  return amount;
}

function currencyCode(value) {
  const currency = clean(value).toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) {
    throw new Error("PMS_FOLIO_CHARGE_CURRENCY_INVALID");
  }
  return currency;
}

function normalizeProviderAck(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const transactionExternalId = clean(source.transactionExternalId);
  const postedAt = clean(source.postedAt);
  const ok = source.ok === true && Boolean(transactionExternalId);
  return Object.freeze({
    ok,
    transactionExternalId: transactionExternalId || null,
    postedAt: postedAt || null,
    errorCode: clean(source.errorCode) || null,
  });
}

export function prepareMassagePmsFolioCharge(input = {}) {
  const booking = input.booking || {};
  const pms = input.pms || {};

  const nativeBookingId = requiredText(
    booking.nativeBookingId,
    "PMS_MASSAGE_BOOKING_ID_REQUIRED",
  );
  const serviceId = requiredText(
    booking.serviceId,
    "PMS_MASSAGE_SERVICE_ID_REQUIRED",
    120,
  );
  const roomNumber = requiredText(
    booking.roomNumber,
    "PMS_MASSAGE_ROOM_REQUIRED",
    80,
  );
  const amountMinor = positiveMinor(booking.amountMinor);
  const currency = currencyCode(booking.currency);

  const stayExternalId = requiredText(
    pms.stayExternalId,
    "PMS_STAY_EXTERNAL_ID_REQUIRED",
  );
  const roomExternalId = requiredText(
    pms.roomExternalId,
    "PMS_ROOM_EXTERNAL_ID_REQUIRED",
  );
  const serviceCode = requiredText(
    pms.serviceCode,
    "PMS_SERVICE_CODE_REQUIRED",
    120,
  );

  const command = buildIntegrationCommand({
    connection: input.connection,
    actionType: "folio.charge.post",
    correlationId: nativeBookingId,
    target: {
      stayExternalId,
      roomExternalId,
    },
    input: {
      amountMinor,
      currency,
      serviceCode,
      gostayaBookingId: nativeBookingId,
      roomNumber,
      serviceId,
    },
  });

  return Object.freeze({
    schemaVersion: "gostaya-massage-pms-folio-charge-v1",
    state: "charge_requested",
    charged: false,
    retryRequired: false,
    nativeBookingId,
    serviceId,
    roomNumber,
    amountMinor,
    currency,
    serviceCode,
    stayExternalId,
    roomExternalId,
    command,
  });
}

export async function executeMassagePmsFolioCharge(input = {}) {
  const prepared = prepareMassagePmsFolioCharge(input);
  const postFolioCharge = input.postFolioCharge;

  if (typeof postFolioCharge !== "function") {
    throw new Error("PMS_FOLIO_CHARGE_ADAPTER_REQUIRED");
  }

  try {
    const ack = normalizeProviderAck(
      await postFolioCharge(prepared.command),
    );

    if (!ack.ok) {
      return Object.freeze({
        ...prepared,
        state: "pending_pms",
        charged: false,
        retryRequired: true,
        pmsTransactionExternalId: null,
        pmsPostedAt: null,
        errorCode: ack.errorCode || "PMS_FOLIO_CHARGE_NOT_CONFIRMED",
      });
    }

    return Object.freeze({
      ...prepared,
      state: "charged",
      charged: true,
      retryRequired: false,
      pmsTransactionExternalId: ack.transactionExternalId,
      pmsPostedAt: ack.postedAt,
      errorCode: null,
    });
  } catch (error) {
    return Object.freeze({
      ...prepared,
      state: "pending_pms",
      charged: false,
      retryRequired: true,
      pmsTransactionExternalId: null,
      pmsPostedAt: null,
      errorCode: "PMS_FOLIO_CHARGE_TRANSPORT_ERROR",
      providerError:
        error instanceof Error ? error.message : String(error),
    });
  }
}
