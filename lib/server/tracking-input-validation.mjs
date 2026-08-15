const MAX_BODY_CHARS = 32_768;
const MAX_NESTED_OBJECT_CHARS = 8_192;
const MAX_OBJECT_KEYS = 50;
const MAX_ARRAY_ITEMS = 50;
const MAX_JSON_DEPTH = 5;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const TEXT_LIMITS = Object.freeze({
  hotelSlug: 120,
  hotelAlias: 120,
  eventName: 160,
  scanSessionId: 200,
  roomId: 120,
  userSessionId: 200,
  sessionId: 200,
  section: 160,
  sectionKey: 160,
  label: 500,
  src: 300,
  page: 600,
  pagePath: 600,
  environment: 32,
  eventCategory: 120,
  itemKey: 160,
  buttonKey: 160,
  language: 64,
  deviceType: 80,
  osFamily: 80,
  browserFamily: 80,
  pwaMode: 80,
  screenSizeGroup: 80,
  roomSource: 120,
  requestId: 160,
  stayId: 160,
  stayDeviceId: 160,
});

function fail(code, message, field = null, status = 400) {
  return { ok: false, status, code, message, field };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function jsonSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function optionalText(body, field, maxLength) {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return fail(
      "INVALID_TRACKING_FIELD",
      `Invalid field type: ${field}`,
      field,
    );
  }

  const text = value.trim();
  if (text.length > maxLength) {
    return fail(
      "TRACKING_FIELD_TOO_LONG",
      `Field is too long: ${field}`,
      field,
    );
  }

  return { ok: true, value: text || null };
}

function requiredText(body, field, maxLength) {
  const result = optionalText(body, field, maxLength);
  if (!result.ok) return result;

  if (!result.value) {
    return fail(
      "MISSING_TRACKING_EVENT",
      `Missing required field: ${field}`,
      field,
    );
  }

  return result;
}

function optionalScalar(body, field, maxStringLength = 500) {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (text.length > maxStringLength) {
      return fail(
        "TRACKING_FIELD_TOO_LONG",
        `Field is too long: ${field}`,
        field,
      );
    }
    return { ok: true, value: text || null };
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return { ok: true, value };
  }

  if (typeof value === "boolean") {
    return { ok: true, value };
  }

  return fail(
    "INVALID_TRACKING_FIELD",
    `Invalid scalar field: ${field}`,
    field,
  );
}

function sanitizeJsonValue(value, depth = 0) {
  if (value === null) return { ok: true, value: null };

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false };
  }

  if (depth >= MAX_JSON_DEPTH) {
    return { ok: false };
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) return { ok: false };

    const items = [];
    for (const item of value) {
      const sanitized = sanitizeJsonValue(item, depth + 1);
      if (!sanitized.ok) return { ok: false };
      items.push(sanitized.value);
    }

    return { ok: true, value: items };
  }

  if (!isPlainObject(value)) return { ok: false };

  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) return { ok: false };

  const clean = {};
  for (const [key, nestedValue] of entries) {
    if (FORBIDDEN_KEYS.has(key)) return { ok: false };

    const sanitized = sanitizeJsonValue(nestedValue, depth + 1);
    if (!sanitized.ok) return { ok: false };
    clean[key] = sanitized.value;
  }

  return { ok: true, value: clean };
}

function optionalObject(body, field) {
  const value = body[field];
  if (value === undefined || value === null) {
    return { ok: true, value: {} };
  }

  if (!isPlainObject(value)) {
    return fail(
      "INVALID_TRACKING_FIELD",
      `${field} must be a JSON object.`,
      field,
    );
  }

  if (jsonSize(value) > MAX_NESTED_OBJECT_CHARS) {
    return fail(
      "TRACKING_NESTED_OBJECT_TOO_LARGE",
      `${field} is too large.`,
      field,
      413,
    );
  }

  const sanitized = sanitizeJsonValue(value);
  if (!sanitized.ok) {
    return fail(
      "INVALID_TRACKING_FIELD",
      `${field} contains an unsupported nested value.`,
      field,
    );
  }

  return { ok: true, value: sanitized.value };
}

export function validateTrackingPayload(body) {
  if (!isPlainObject(body)) {
    return fail(
      "INVALID_TRACKING_BODY",
      "Tracking body must be a JSON object.",
    );
  }

  if (jsonSize(body) > MAX_BODY_CHARS) {
    return fail(
      "TRACKING_BODY_TOO_LARGE",
      "Tracking body is too large.",
      null,
      413,
    );
  }

  const eventName = requiredText(body, "eventName", TEXT_LIMITS.eventName);
  if (!eventName.ok) return eventName;

  const fields = {};
  for (const field of Object.keys(TEXT_LIMITS)) {
    if (field === "eventName") continue;
    const result = optionalText(body, field, TEXT_LIMITS[field]);
    if (!result.ok) return result;
    fields[field] = result.value;
  }

  const roomNumber = optionalScalar(body, "roomNumber", 32);
  if (!roomNumber.ok) return roomNumber;

  const roomId = optionalScalar(body, "roomId", TEXT_LIMITS.roomId);
  if (!roomId.ok) return roomId;

  const value = optionalScalar(body, "value", 500);
  if (!value.ok) return value;

  const extra = optionalObject(body, "extra");
  if (!extra.ok) return extra;

  const metadata = optionalObject(body, "metadata");
  if (!metadata.ok) return metadata;

  if (
    body.roomConfirmed !== undefined &&
    body.roomConfirmed !== null &&
    typeof body.roomConfirmed !== "boolean"
  ) {
    return fail(
      "INVALID_TRACKING_FIELD",
      "roomConfirmed must be a boolean.",
      "roomConfirmed",
    );
  }

  return {
    ok: true,
    value: {
      ...fields,
      eventName: eventName.value,
      roomNumber: roomNumber.value,
      roomId: roomId.value,
      value: value.value,
      extra: extra.value,
      metadata: metadata.value,
      roomConfirmed: body.roomConfirmed === true,
    },
  };
}

export function getTrackingMaxBodyChars() {
  return MAX_BODY_CHARS;
}
