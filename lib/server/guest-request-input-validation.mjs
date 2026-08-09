const MAX_BODY_CHARS = 16_384;

const LIMITS = Object.freeze({
  hotelSlug: 100,
  room: 32,
  type: 100,
  typeLabel: 200,
  note: 1_000,
  serviceTime: 16,
  sourceRequestDef: 160,
  guestLanguage: 16,
  stayId: 128,
  stayDeviceId: 128,
  lateCheckoutRequestedTime: 5,
});

const SERVICE_TIMES = new Set(["now", "today", "tomorrow"]);

function fail(code, message, field = null, status = 400) {
  return {
    ok: false,
    status,
    code,
    message,
    field,
  };
}

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function bodySize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function normalizeRoom(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function requiredString(body, field, maxLength, options = {}) {
  const value = body[field];

  if (value === undefined || value === null || value === "") {
    return fail(
      "MISSING_REQUIRED_FIELD",
      `Missing required field: ${field}`,
      field,
    );
  }

  if (
    typeof value !== "string" &&
    !(options.allowNumber === true && typeof value === "number" && Number.isFinite(value))
  ) {
    return fail(
      "INVALID_REQUEST_FIELD",
      `Invalid field type: ${field}`,
      field,
    );
  }

  let text = options.allowNumber === true ? String(value) : value;
  text = text.trim();

  if (!text) {
    return fail(
      "MISSING_REQUIRED_FIELD",
      `Missing required field: ${field}`,
      field,
    );
  }

  if (text.length > maxLength) {
    return fail(
      "REQUEST_FIELD_TOO_LONG",
      `Field is too long: ${field}`,
      field,
    );
  }

  return { ok: true, value: text };
}

function optionalString(body, field, maxLength, options = {}) {
  const value = body[field];

  if (value === undefined || value === null || value === "") {
    return { ok: true, value: options.defaultValue ?? null };
  }

  if (typeof value !== "string") {
    return fail(
      "INVALID_REQUEST_FIELD",
      `Invalid field type: ${field}`,
      field,
    );
  }

  const text = value.trim();

  if (text.length > maxLength) {
    return fail(
      "REQUEST_FIELD_TOO_LONG",
      `Field is too long: ${field}`,
      field,
    );
  }

  return {
    ok: true,
    value: text || options.defaultValue || null,
  };
}

export function validateGuestRequestCreatePayload(body) {
  if (!isPlainObject(body)) {
    return fail(
      "INVALID_REQUEST_BODY",
      "Request body must be a JSON object.",
    );
  }

  if (bodySize(body) > MAX_BODY_CHARS) {
    return fail(
      "REQUEST_BODY_TOO_LARGE",
      "Request body is too large.",
      null,
      413,
    );
  }

  const hotelSlugResult = requiredString(
    body,
    "hotelSlug",
    LIMITS.hotelSlug,
  );
  if (!hotelSlugResult.ok) return hotelSlugResult;

  const roomResult = requiredString(
    body,
    "room",
    LIMITS.room,
    { allowNumber: true },
  );
  if (!roomResult.ok) return roomResult;

  const typeResult = requiredString(
    body,
    "type",
    LIMITS.type,
  );
  if (!typeResult.ok) return typeResult;

  const typeLabelResult = optionalString(
    body,
    "typeLabel",
    LIMITS.typeLabel,
    { defaultValue: typeResult.value },
  );
  if (!typeLabelResult.ok) return typeLabelResult;

  const noteResult = optionalString(body, "note", LIMITS.note);
  if (!noteResult.ok) return noteResult;

  const serviceTimeResult = optionalString(
    body,
    "serviceTime",
    LIMITS.serviceTime,
    { defaultValue: "now" },
  );
  if (!serviceTimeResult.ok) return serviceTimeResult;

  const serviceTime = String(serviceTimeResult.value || "now").toLowerCase();
  if (!SERVICE_TIMES.has(serviceTime)) {
    return fail(
      "INVALID_REQUEST_FIELD",
      "Invalid serviceTime.",
      "serviceTime",
    );
  }

  const sourceRequestDefResult = optionalString(
    body,
    "sourceRequestDef",
    LIMITS.sourceRequestDef,
  );
  if (!sourceRequestDefResult.ok) return sourceRequestDefResult;

  const guestLanguageResult = optionalString(
    body,
    "guestLanguage",
    LIMITS.guestLanguage,
    { defaultValue: "en" },
  );
  if (!guestLanguageResult.ok) return guestLanguageResult;

  const guestLanguage = String(guestLanguageResult.value || "en").toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(guestLanguage)) {
    return fail(
      "INVALID_REQUEST_FIELD",
      "Invalid guestLanguage.",
      "guestLanguage",
    );
  }

  const stayIdResult = optionalString(body, "stayId", LIMITS.stayId, {
    defaultValue: "",
  });
  if (!stayIdResult.ok) return stayIdResult;

  const stayDeviceIdResult = optionalString(
    body,
    "stayDeviceId",
    LIMITS.stayDeviceId,
    { defaultValue: "" },
  );
  if (!stayDeviceIdResult.ok) return stayDeviceIdResult;

  const lateCheckoutTimeResult = optionalString(
    body,
    "lateCheckoutRequestedTime",
    LIMITS.lateCheckoutRequestedTime,
  );
  if (!lateCheckoutTimeResult.ok) return lateCheckoutTimeResult;

  const lateCheckoutRequestedTime = lateCheckoutTimeResult.value;
  if (
    lateCheckoutRequestedTime &&
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(lateCheckoutRequestedTime)
  ) {
    return fail(
      "INVALID_REQUEST_FIELD",
      "Invalid lateCheckoutRequestedTime.",
      "lateCheckoutRequestedTime",
    );
  }

  return {
    ok: true,
    value: {
      hotelSlug: hotelSlugResult.value.toLowerCase(),
      room: normalizeRoom(roomResult.value),
      rawType: typeResult.value,
      typeLabel: typeLabelResult.value || typeResult.value,
      note: noteResult.value,
      serviceTime,
      requestedSourceRequestDef: sourceRequestDefResult.value,
      guestLanguage,
      stayId: stayIdResult.value || "",
      stayDeviceId: stayDeviceIdResult.value || "",
      lateCheckoutRequestedTime,
    },
  };
}

export function getGuestRequestCreateMaxBodyChars() {
  return MAX_BODY_CHARS;
}
